-- The photographs stop being public.
--
-- `0004` made the bucket public and said why: a complaint forwarded to a sector
-- hall is text plus a link, and a link that needs a bearer token is a link
-- nobody at the far end can open. That reasoning was about the *recipient* and
-- ignored everybody else, because a public bucket has no recipients -- it has
-- the internet.
--
-- WHAT WAS ACTUALLY READABLE. A blocker report is a photograph of a car on a
-- pavement, which means a registration number, often a face, always a street
-- and a timestamp. `0006` revoked the `plate` column from strangers on exactly
-- that reasoning, and left the pictures the plate was typed off. The URLs were
-- not even secret: they sat in `reports.photos`, in a table whose select policy
-- is `using (true)`, so reading every photograph anybody had ever filed took
-- one request with the anon key that ships inside the app.
--
-- WHAT REPLACES IT. The bucket is private and only the author may read their
-- own evidence. Everybody else -- including a signed-in stranger, including the
-- app itself on a list screen -- gets to know that a report has three
-- photographs and gets no way to open one.
--
-- WHY NOT BLUR THE PLATES AND SHOW THE REST, which is what the issue asks for.
-- Because blurring is image processing, there is nowhere in this stack running
-- it today, and a preview that is published as redacted and is not is worse
-- than no preview: the driver believes the app protected them. So the public
-- preview is *absent* rather than fake, and the column that would carry it does
-- not exist yet. When there is a redactor, it writes derived files to a second,
-- public bucket, and nothing in this migration has to be loosened to let it.
--
-- WHY THE AUTHOR ONLY, WHEN THE ISSUE SAYS "AUTHOR AND AUTHORISED RESOLVERS".
-- Because storage has one permission and two uses. Supabase signs a URL only
-- for a caller that may `select` the object, and listing the bucket is the same
-- `select` -- so a policy granting resolvers direct access would grant every
-- resolver the whole bucket, and every read through it would be invisible to
-- the audit below. A resolver's route is `evidence_paths` plus an edge function
-- holding the service key, which is #12's and #13's work, and until it exists
-- the honest thing is a door that is shut rather than one that is open and
-- unwatched.

-- ---------------------------------------------------------------------------
-- The bucket
-- ---------------------------------------------------------------------------

update storage.buckets set public = false where id = 'report-photos';

drop policy if exists "Report photos are readable by everybody" on storage.objects;

-- The author, and nobody else. The first path segment is the uploader's uuid,
-- written by `uploadPhotos` in lib/supabase-data.ts and enforced by the insert
-- policy from 0004, which is what makes this check meaningful rather than
-- decorative.
drop policy if exists "A driver reads their own evidence" on storage.objects;
create policy "A driver reads their own evidence"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'report-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- What the column holds
-- ---------------------------------------------------------------------------
--
-- Paths from here on, not URLs.
--
-- Not tidiness. A public URL is a capability: it is the whole of what somebody
-- needs to fetch the file, and it was sitting in a world-readable column. Even
-- with the bucket private those rows would keep a record of the exact form the
-- link took, and the app would go on round-tripping them. A path is inert --
-- it opens nothing without a signature, and a signature is what the policy
-- above decides.
--
-- The rewrite is idempotent: a value that does not match is already a path and
-- is left alone.

update public.reports
set photos = (
  select coalesce(array_agg(
    regexp_replace(photo, '^https?://.*/storage/v1/object/public/report-photos/', '')
  ), '{}')
  from unnest(photos) as photo
)
where exists (
  select 1 from unnest(photos) as photo where photo like 'http%'
);

update public.report_events
set photos = (
  select coalesce(array_agg(
    regexp_replace(photo, '^https?://.*/storage/v1/object/public/report-photos/', '')
  ), '{}')
  from unnest(photos) as photo
)
where exists (
  select 1 from unnest(photos) as photo where photo like 'http%'
);

comment on column public.reports.photos is
  'Storage paths in the private report-photos bucket. Never URLs.';

-- `report_events.photos` is rewritten too, and is a different problem left
-- deliberately unsolved. A resolution photograph is a picture of a kerb that is
-- now clear, taken by whoever went back to look -- which is rarely the person
-- who complained. It lands in the same private bucket under the *resolver's*
-- uuid, so under the policy above the original author cannot see the proof that
-- their own complaint was settled.
--
-- Nothing writes that table yet, so nothing is broken today; the flow that will
-- is #13. Recorded here because the next person to build it will otherwise find
-- out from a blank screen, and because the answer is a decision rather than a
-- bug: a cleared pavement is closer to a public fact than a blocked one is, and
-- it may well belong in a second bucket that is readable by everybody.
comment on column public.report_events.photos is
  'Storage paths in the private report-photos bucket. See 0009 on who can read them.';

-- ---------------------------------------------------------------------------
-- What a stranger may read
-- ---------------------------------------------------------------------------
--
-- The view already masks the plate per row; the paths join it, for the same
-- reason and by the same mechanism. `photo_count` is what is left: a report
-- with evidence behind it is a stronger complaint than one without, and saying
-- how many pictures exist gives that away without giving away the pictures.
--
-- Note that this is defence in depth rather than the defence. The paths are
-- useless to a stranger anyway now that the bucket is private -- the policy
-- above is what actually stops them. This stops the app from *offering* them,
-- which is what keeps a future screen from trying.

-- Dropped and rebuilt rather than replaced: `create or replace view` may add
-- columns at the end and nothing else, and `photo_count` belongs beside the
-- array it counts rather than after `created_at` because somebody had to work
-- around a restriction. Nothing depends on the view but the app.
drop view if exists public.reports_readable;

create view public.reports_readable as
select
  id,
  category,
  latitude,
  longitude,
  address,
  case when created_by = (select auth.uid()) then plate end as plate,
  note,
  case
    when created_by = (select auth.uid()) then photos
    else '{}'::text[]
  end as photos,
  coalesce(array_length(photos, 1), 0) as photo_count,
  created_by,
  created_at
from public.reports;

comment on view public.reports_readable is
  'Reports as the app may read them: the plate and the evidence are the author''s.';

-- EVERY PRIVILEGE OFF FIRST, and this is not belt and braces -- it closes a
-- hole the old view has had since 0006.
--
-- Supabase bootstraps the project with
--
--   alter default privileges in schema public grant all on tables to
--     postgres, anon, authenticated, service_role;
--
-- and a view is a table for that purpose, so creating one hands `anon`
-- `insert`, `update` and `delete` on it as well as `select`. That would be
-- inert on a view Postgres cannot write through, and this is not one: a single
-- table in `from`, no `distinct`, no grouping, no set operation and no
-- aggregate makes it *automatically updatable*, and the columns that are plain
-- references -- `id`, `category`, the coordinates, `note`, `created_by` -- are
-- writable through it. `plate`, `photos` and `photo_count` are not, being
-- expressions, so this was never a way to read the evidence.
--
-- It was a way to destroy it. A view is not `security_invoker` by default, so
-- writes through it run as the view's owner, and the owner is `postgres`, which
-- both owns `reports` and holds `bypassrls`. Every policy on the table is
-- therefore skipped: with the anon key that ships inside the app,
-- `delete from reports_readable where id = ...` removes anybody's complaint --
-- and cascades into `report_events` and into the audit table added below, so
-- the record of who read what could be erased by whoever read it.
--
-- `security_invoker = true` would be the other way out and is the wrong one: it
-- would have the view read `plate` as the caller, which is exactly what the
-- caller may not do, and the masking would return null to everybody including
-- the author.
revoke all on public.reports_readable from anon, authenticated;
grant select on public.reports_readable to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The plate was never actually revoked
-- ---------------------------------------------------------------------------
--
-- `0006` ends with
--
--   revoke select (plate) on public.reports from anon, authenticated;
--
-- and that statement has done nothing since the day it was written, because
-- `0003` had already said
--
--   grant select on public.reports to anon, authenticated;
--
-- A table-level `select` grant is a grant on every column, present and future,
-- and Postgres does not let a column-level `revoke` cut a hole in one: the
-- documentation is explicit that revoking a column privilege has no effect
-- while the table-level privilege stands. It does not warn, and it does not
-- error. `revoke` on a privilege that was never separately granted is a no-op,
-- and a no-op is what it was.
--
-- SO EVERY NUMBER PLATE EVER FILED HAS BEEN READABLE with the anon key that
-- ships inside the app, by asking the table instead of the view: one request,
-- `select plate from reports`. `reports_readable` masked it correctly and
-- nothing obliged anybody to go through `reports_readable`.
--
-- The fix is the shape the revoke was reaching for: take the table-level grant
-- away and hand back the columns one at a time. Adding a column to `reports`
-- from here on means adding it here too, and that is the right amount of
-- friction for a table where one column is personal data.
--
-- `photos` goes with it, and for a different reason than the plate. A path is
-- inert -- it opens nothing while the bucket is private, and the two things it
-- carries, the author's uuid and the report id, are already public in
-- `created_by` and `id`. So this is not about confidentiality. It is about the
-- audit below being true: `evidence_paths` claims to be the only route to
-- another person's evidence and to write down that it was taken, and a column
-- anybody may `select` is a second route that writes down nothing. A resolver
-- who wanted no record of having looked would simply ask the table.
--
-- The app never needed it: reports are read through `reports_readable`, which
-- hands the author their own paths, and `insertReport` stops asking for the
-- column back -- it has just supplied it.

revoke select on public.reports from anon, authenticated;

grant select (
  id,
  category,
  latitude,
  longitude,
  address,
  note,
  created_by,
  created_at
) on public.reports to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Who looked at somebody else's evidence
-- ---------------------------------------------------------------------------

create table if not exists public.evidence_access (
  id bigint generated always as identity primary key,
  report_id text not null references public.reports (id) on delete cascade,
  -- Not null: an unattributed look at a stranger's photographs is the one
  -- thing this table exists to make impossible.
  looked_by uuid not null references auth.users (id),
  -- Why they were entitled to. Recorded rather than inferred, because the grant
  -- can be revoked afterwards and the log has to stay true about the moment.
  as_role public.account_role not null,
  looked_at timestamptz not null default now()
);

create index if not exists evidence_access_report_idx
  on public.evidence_access (report_id, looked_at desc);

comment on table public.evidence_access is
  'Every disclosure of a report''s evidence to somebody who did not file it.';

/**
 * The paths of a report's photographs, for somebody entitled to them.
 *
 * The only route to another person's evidence, and it writes down that it was
 * taken. `security definer` because the caller may not read `reports.photos`
 * for a report that is not theirs -- that is the point of the view above -- so
 * the function is what turns a role into a disclosure, once, on the record.
 *
 * An author calling it is not logged. They are reading their own photograph,
 * which they took; a log of that is noise in a table whose whole value is that
 * every row in it is worth reading.
 *
 * The paths alone open nothing: the bucket is private and this function grants
 * no storage privilege. Turning them into bytes for a resolver needs a service
 * key, which never ships in a client -- see the header for why that separation
 * is deliberate rather than unfinished.
 */
create or replace function public.evidence_paths(wanted_report text)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid;
  found text[];
begin
  select r.created_by, r.photos into author, found
  from public.reports r
  where r.id = wanted_report;

  if author is null then
    return null;
  end if;

  if author = (select auth.uid()) then
    return found;
  end if;

  if not public.has_role('resolver') then
    raise exception 'Not entitled to this report''s evidence'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.evidence_access (report_id, looked_by, as_role)
  values (wanted_report, (select auth.uid()), 'resolver');

  return found;
end;
$$;

grant execute on function public.evidence_paths(text) to authenticated;

-- Readable by an admin, so a misuse can be found, and by nobody else: a log of
-- who read what is itself a record of who was investigating whom. No client
-- writes it -- `evidence_paths` does, as definer.
alter table public.evidence_access enable row level security;

drop policy if exists "An admin reads the evidence log" on public.evidence_access;
create policy "An admin reads the evidence log"
  on public.evidence_access for select
  to authenticated
  using (public.has_role('admin'));

grant select on public.evidence_access to authenticated;
revoke insert, update, delete on public.evidence_access from anon, authenticated;

-- ---------------------------------------------------------------------------
-- How long evidence lives
-- ---------------------------------------------------------------------------
--
-- A blocked pavement is news. The app reads thirty days of it
-- (`REPORT_HISTORY_DAYS` in lib/supabase-data.ts) and the photograph stops
-- being useful to anybody long before it stops being a photograph of somebody's
-- car outside their house.
--
-- Nothing here is scheduled, and nothing here calls it. The pair below is the
-- database's half of a job that has to run somewhere with a service key,
-- because the middle step -- deleting the actual files -- is the storage API's
-- and not SQL's. See `evidence_past_retention` for why that is a division of
-- labour rather than a gap.

/**
 * The evidence that is past its life, so a scheduled job can remove it.
 *
 * Reads and changes nothing. That division is the whole point of splitting
 * retention in two, and it comes from a limit worth stating plainly: deleting
 * a row from `storage.objects` deletes the *record* of a file, not the file.
 * The bytes live in object storage and are removed by storage-api's own delete
 * endpoint, so a `delete from storage.objects` in here would leave every
 * photograph exactly where it was, with nothing left pointing at it — a
 * retention rule that erases the evidence of what it failed to erase.
 *
 * So the database says what is past retention, the storage API deletes it, and
 * `forget_evidence` below is called afterwards to clear the rows. In that
 * order: a crash between the second and third steps leaves a row naming files
 * that are gone, which the app already survives -- `signEvidence` drops a path
 * storage will not sign. The other order would lose the paths first and leave
 * the files forever.
 */
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
$$;

comment on function public.evidence_past_retention(interval) is
  'What a retention job should delete through the storage API. Changes nothing.';

/**
 * Forget the photographs of reports whose files have already been removed.
 *
 * The complaint stays. A report is a dated record of a blocked pavement and it
 * is still true a year later; what expires is the photograph of somebody's
 * car outside somebody's house, which stopped being useful to anybody long
 * before it stopped being personal data.
 *
 * Twelve months rather than the thirty days the app reads, because a report
 * and its evidence age differently: a complaint forwarded to a sector hall may
 * still be open months later, and deleting the proof would leave it unprovable.
 */
create or replace function public.forget_evidence(wanted text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  gone integer;
begin
  -- `wanted` rather than `reports`, which is the obvious name and is ambiguous
  -- against the table it reads: plpgsql resolves a bare identifier as a column
  -- before a parameter, and the failure is at call time rather than at create.
  with cleared as (
    update public.reports
    set photos = '{}'
    where id = any(wanted)
      and coalesce(array_length(photos, 1), 0) > 0
    returning 1
  )
  select count(*) into gone from cleared;

  return gone;
end;
$$;

comment on function public.forget_evidence(text[]) is
  'Clears report photo paths. Call it after the files are gone, never before.';

-- ---------------------------------------------------------------------------
-- Who may call any of this
-- ---------------------------------------------------------------------------
--
-- THE SAME MISTAKE THIS MIGRATION IS ALREADY FIXING ONCE. `revoke ... from
-- public` is what one reaches for, and it would have done nothing, for exactly
-- the reason the plate revoke above did nothing: Supabase bootstraps the
-- project with
--
--   alter default privileges in schema public grant all on functions to
--     postgres, anon, authenticated, service_role;
--
-- so every function created here is granted to `anon` and `authenticated`
-- explicitly, and revoking from the `public` pseudo-role leaves those grants
-- untouched. The grantees have to be named.
--
-- What that would have cost: `forget_evidence` is `security definer` and its
-- owner holds `bypassrls`, so one unauthenticated POST to
-- `/rest/v1/rpc/forget_evidence` with a list of report ids -- or, in the
-- version of this function that took an interval, a negative one -- would blank
-- the evidence of every report in the city.
revoke execute on function public.evidence_past_retention(interval)
  from public, anon, authenticated;
revoke execute on function public.forget_evidence(text[])
  from public, anon, authenticated;

-- `evidence_paths` is the exception, and deliberately so: the app calls it. It
-- carries its own refusal rather than relying on a grant, which is why `anon`
-- reaching it lands on `insufficient_privilege` instead of on somebody's
-- photographs.
