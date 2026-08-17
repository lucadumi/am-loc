-- Make the retention periods true
--
-- Every table in `data_inventory` carries a retention period, and until this
-- migration every one of them was a sentence somebody had written down. The
-- functions existed and were correct; nothing called them. A policy nothing
-- enforces is a claim about the future, and `docs/dpia.md` listed it first
-- under what is not done for exactly that reason.
--
-- WHAT RUNS, AND WHERE. Three of the rules are pure SQL and run inside the
-- database, on pg_cron, with nothing else involved:
--
--   * `forget_report_plates()` clears registration numbers off reports older
--     than twelve months. The complaint stays; whose car it was stops being
--     anybody's business at the same moment the photograph does.
--   * `forget_old_evidence_access()` expires the disclosure log at twenty-four
--     months, which is the limit of the exemption that lets it survive an
--     erasure at all.
--   * `forget_old_erasure_requests()` expires the proof that somebody was
--     forgotten, at the three years the register promises.
--
-- The last one cannot run here and `0009` explains why at length: deleting a row
-- from `storage.objects` deletes the *record* of a file and not the file, and
-- an `auth.users` row needs the admin API. Both are HTTP calls carrying the
-- service key. So the third job is `supabase/functions/retention`, and this
-- file only knocks on its door once a night.
--
-- WHY THE KEY IS IN THE VAULT AND NOT IN THIS FILE. The call has to
-- authenticate as the service role, and this file is in a public repository.
-- The two values it needs are read out of `vault.decrypted_secrets` at the
-- moment the job runs, and they are put there by hand, once, per project:
--
--     select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--     select vault.create_secret('<the service role key>', 'service_role_key');
--
-- It has to be the `service_role` key itself, the one the platform injects
-- into the function as `SUPABASE_SERVICE_ROLE_KEY`: the function compares what
-- arrives against that, so a project that has moved to the newer `sb_secret_…`
-- keys needs the function's `verify_jwt` turned off and this comparison moved
-- onto whichever secret it does send.
--
-- Until somebody does that the http job selects from an empty result and makes
-- no call at all -- no error, no half-authenticated request, nothing. That is
-- deliberate: a fresh clone of this schema should be inert rather than broken,
-- and the SQL two jobs above still run on their own.
--
-- HOW TO SEE WHETHER ANY OF IT HAPPENED.
--
--     select jobid, jobname, schedule, active from cron.job;
--     select jobname, status, return_message, start_time
--       from cron.job_run_details order by start_time desc limit 20;
--
-- and, for the third, the function's own log in the dashboard: it prints what
-- it removed and, more usefully, what it could not.
--
-- WHAT ELSE IS IN HERE, AND WHY IT HAD TO BE. Scheduling this turned three
-- theoretical holes into live ones, because until today nothing with the
-- service key ever acted on what these tables said:
--
--   * `reports.photos` is a `text[]` and the insert policy only checks the
--     author, so any signed-in driver could file a report naming somebody
--     else's photograph and let the nightly job delete it for them. A
--     privileged deleter must never be pointed at a path by the same person it
--     is being run against.
--   * `created_at` was insertable, so a report could be filed already older
--     than its own retention period -- or dated far enough into the future to
--     outlive it.
--   * The bucket accepted uploads from an account whose erasure was midway
--     through, which is how "everything of yours is gone" becomes false a
--     second after it is said.
--
-- And one thing the register promised and nobody had written: `erasure_requests`
-- says three years, and nothing expired it.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- A report may only name its own photographs
-- ---------------------------------------------------------------------------
--
-- The paths are `<author>/<report id>/<file>`, built by `evidencePath` in
-- lib/evidence.ts, and the storage policies in `0004` already stop a driver
-- writing outside their own folder. What nothing checked is the other half:
-- that the strings in `photos` name files in *this* report's folder. A row is
-- not a file, so writing somebody else's path into your own report was free,
-- and harmless for exactly as long as nothing acted on it.
--
-- `created_at` is pinned here too. `refuse_rewriting_a_report` in `0003` holds
-- the moment still against edits and says why; there was no equivalent at
-- insert, so the moment a report claims to have happened -- the clock every
-- retention rule in this project is measured against -- was whatever the
-- client typed.

create or replace function public.reports_own_their_photos()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  folder text;
  arriving text[];
  photo text;
begin
  if tg_op = 'INSERT' then
    -- Not `default now()`, which a client can override by naming the column.
    new.created_at := now();
    arriving := coalesce(new.photos, '{}');
  else
    -- Only what this edit adds. A row written before this rule existed can
    -- still be corrected by its author; what it cannot do is gain a path that
    -- was never theirs.
    arriving := array(
      select adding
      from unnest(coalesce(new.photos, '{}')) as adding
      where adding <> all(coalesce(old.photos, '{}'))
    );
  end if;

  folder := new.created_by::text || '/' || new.id || '/';

  foreach photo in array arriving loop
    -- `starts_with` and not `like`: a report's id is chosen by the client, and
    -- `_` and `%` in a `like` pattern are wildcards. A check somebody can
    -- loosen by naming their report after it is not a check.
    if not starts_with(photo, folder) then
      raise exception
        'A report may only carry photographs from its own folder'
        using errcode = 'integrity_constraint_violation';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists reports_own_their_photos on public.reports;
create trigger reports_own_their_photos
  before insert or update on public.reports
  for each row execute function public.reports_own_their_photos();

-- Belt and braces, and the one that matters most: even with the trigger above,
-- the job is told what to delete by this function, so this is where a path
-- that is not the report's own stops being the job's business. A planted row
-- from before today is simply never returned -- it stays in the column, inert,
-- naming a file this project will not touch.
--
-- The order is new, and load-bearing: the worker reads this in pages, and a
-- query with no `order by` may hand back the same row twice and another one
-- never.
create or replace function public.evidence_past_retention(
  older_than interval default '12 months'
)
returns table (report_id text, path text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, photo
  from public.reports r, unnest(r.photos) as photo
  where r.created_at < now() - older_than
    and starts_with(photo, r.created_by::text || '/' || r.id || '/')
  order by r.id, photo
$$;

comment on function public.evidence_past_retention(interval) is
  'What a retention job should delete through the storage API. Changes nothing.';

revoke all on function public.evidence_past_retention(interval)
  from public, anon, authenticated;
grant execute on function public.evidence_past_retention(interval) to service_role;

-- ---------------------------------------------------------------------------
-- Clearing exactly what was deleted
-- ---------------------------------------------------------------------------
--
-- `forget_evidence(text[])` in `0009` takes report ids and blanks their whole
-- `photos` array. That was right while the job was imagined as one pass over
-- one list, and it is wrong in two ways as soon as the job is real:
--
--   * The list arrives in pages. A report whose photographs straddle a page
--     boundary would be blanked on the strength of the half that was seen,
--     and the other half's files would stay in the bucket with nothing left
--     naming them -- the exact failure `0009` wrote three paragraphs to avoid.
--   * A report can be edited while the job runs. Blanking by id throws away a
--     photograph added a second ago as well as the ones that expired.
--
-- So the job clears by path. What was deleted is what is forgotten, one string
-- at a time, and a file the storage API refused to delete keeps its name in
-- the row until some later night succeeds.

create or replace function public.forget_evidence_paths(gone text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  touched integer;
begin
  with cleared as (
    update public.reports
    set photos = array(
      select kept from unnest(photos) as kept where kept <> all(gone)
    )
    where photos && gone
    returning 1
  )
  select count(*) into touched from cleared;

  return touched;
end;
$$;

comment on function public.forget_evidence_paths(text[]) is
  'Removes exactly these paths from whatever report holds them. After the files are gone.';

revoke all on function public.forget_evidence_paths(text[])
  from public, anon, authenticated;
grant execute on function public.forget_evidence_paths(text[]) to service_role;

-- ---------------------------------------------------------------------------
-- Nothing new arrives once somebody has asked to be forgotten
-- ---------------------------------------------------------------------------
--
-- An erasure is not instantaneous: the rows go in `erase_me`, the files and
-- the login go on the next run of the job, and the session on the telephone
-- stays valid until its token expires. In that gap the bucket was still
-- accepting uploads into the very prefix the job is about to sweep, which is a
-- race with only one bad outcome -- a photograph that arrives after the sweep
-- and outlives the account it belonged to, in a folder named after a uuid that
-- no longer means anything to anybody.

drop policy if exists "A driver uploads into their own folder" on storage.objects;
create policy "A driver uploads into their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.erasure_requests r
      where r.user_id = (select auth.uid())
    )
  );

drop policy if exists "A driver replaces their own photo" on storage.objects;
create policy "A driver replaces their own photo"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.erasure_requests r
      where r.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- The register's three years
-- ---------------------------------------------------------------------------
--
-- `erasure_requests` is kept to show that a request was honoured, and the
-- register says three years -- long enough to answer a supervisory authority,
-- and not a place to keep a list of everybody who ever left, forever, which is
-- what "we keep the proof" quietly turns into if nothing expires it.
--
-- Only closed ones. A request still waiting on its photographs is work in
-- progress, and deleting it would lose the only note of what is unfinished.

create or replace function public.forget_old_erasure_requests(
  older_than interval default '3 years'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  gone integer;
begin
  with cleared as (
    delete from public.erasure_requests
    where completed_at is not null
      and completed_at < now() - older_than
    returning 1
  )
  select count(*) into gone from cleared;

  return gone;
end;
$$;

comment on function public.forget_old_erasure_requests(interval) is
  'Expires the proof of an honoured erasure at three years, as the register says.';

revoke all on function public.forget_old_erasure_requests(interval)
  from public, anon, authenticated;
grant execute on function public.forget_old_erasure_requests(interval) to service_role;

-- ---------------------------------------------------------------------------
-- The three that are only SQL
-- ---------------------------------------------------------------------------
--
-- `cron.schedule` on an existing name replaces that job rather than adding a
-- second one, which is what makes re-running this migration safe. The times
-- are spread through the small hours of a Bucharest night: none of them holds
-- a lock anything else waits on, but a `delete` over the disclosure log and an
-- `update` over every old report are both worth keeping away from the morning
-- somebody photographs a blocked pavement.
--
-- All three take their default interval. The parameter exists so a retention
-- period can be argued about in one place -- the function -- rather than in a
-- string inside a scheduler, where it would be invisible to anybody reading
-- the schema.

select cron.schedule(
  'forget-old-plates',
  '0 3 * * *',
  $$select public.forget_report_plates()$$
);

select cron.schedule(
  'expire-evidence-log',
  '30 3 * * *',
  $$select public.forget_old_evidence_access()$$
);

select cron.schedule(
  'expire-erasure-proof',
  '45 3 * * *',
  $$select public.forget_old_erasure_requests()$$
);

-- ---------------------------------------------------------------------------
-- The one that needs a key
-- ---------------------------------------------------------------------------
--
-- Photographs past retention, and erasures whose bytes and login are still
-- there. Both live behind the storage and admin APIs, so this is an HTTP call
-- to the function that holds the key rather than work done in here.
--
-- WHY THE SECRETS ARE JOINED IN RATHER THAN READ INTO VARIABLES. A missing
-- secret then yields no row, so `net.http_post` is never called: the job
-- succeeds having done nothing, which is the honest outcome for a project
-- where nobody has finished the setup. Reading them into a variable would post
-- to `null/functions/v1/retention` with `Bearer null` every night, and the
-- first sign of it would be a log full of 401s from a job whose whole purpose
-- is to be trusted quietly.
--
-- An hour after the SQL two, because a plate cleared at three is one fewer
-- thing for anybody to reason about at four, and because `pg_net` is
-- asynchronous: this returns a request id immediately and the work happens in
-- the function, so nothing here is waiting on a sweep of a city's photographs.

select cron.schedule(
  'retention-worker',
  '0 4 * * *',
  $$
    select net.http_post(
      url := project.decrypted_secret || '/functions/v1/retention',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service.decrypted_secret
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    )
    from vault.decrypted_secrets project, vault.decrypted_secrets service
    where project.name = 'project_url'
      and service.name = 'service_role_key'
  $$
);
