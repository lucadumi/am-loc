-- Every table says what it is for, how long it keeps it, and what erases it.
--
-- The migrations so far each protected one thing at a time: `0006` hid plates
-- from strangers, `0009` took the photographs off the public internet, `0011`
-- narrowed who may read them to the sector that can act. What none of them
-- answered is the question a data subject actually asks -- "what do you have
-- about me, and how do I make you stop?" -- and the answer today is that the
-- app has no way to tell them and no way to comply.
--
-- WHAT WAS ACTUALLY BROKEN. Three delete rules, each of which turns out to be
-- a different kind of wrong, and none of which was noticed because nobody had
-- ever deleted an account.
--
--   `reports.created_by` cascades. That one is now deliberate -- see below --
--   but it was never a decision, it was the default that got written in 0003.
--
--   `report_events.actor` cascades, on a table whose own comment says
--   "append-only". A sector hall resolves a complaint; the warden who filed it
--   later closes their personal account for unrelated reasons; the resolution
--   disappears. A private decision silently rewrites a public body's record of
--   its own work, and the complaint reopens itself.
--
--   `evidence_access.looked_by` has no delete rule at all, so it defaults to
--   `no action`. Anybody who has ever opened somebody else's evidence cannot be
--   deleted: the foreign key refuses. The right to erasure was, in practice,
--   available to everybody except the people the log exists to hold to account.
--
-- WHAT ERASURE DOES HERE. It deletes. A complaint is withdrawn with the person
-- who made it: their reports go, their photographs go, their offers go, their
-- profile goes. That is the most protective reading and it is the one this
-- project takes.
--
-- WHAT SURVIVES IT, AND WHY THAT IS NOT A LOOPHOLE. Exactly one thing: the
-- fact that a public institution resolved a case. Not the report, not the
-- plate, not the pictures, not the address, not the coordinates, not the
-- author -- the category, the sector, the two dates and which office acted.
-- A sector hall sending a warden to a blocked pavement is an official act, and
-- an official act that a private individual can erase months later by closing
-- an unrelated account is not a record. It is a record of nothing.
--
-- The remnant is written when the resolution happens, not conjured when
-- somebody leaves. A ledger assembled at erasure time would contain only the
-- cases whose reporter happened to go, which is a strange and misleading book;
-- this one is complete from the first entry and simply loses its link.
--
-- WHAT THE DATABASE CANNOT DO ON ITS OWN, said plainly rather than left as a
-- gap. Erasure has three halves and Postgres owns one of them. The rows here
-- go immediately. The photographs are bytes in object storage and a
-- `delete from storage.objects` would only remove the *record* of a file --
-- the same trap `0009` documents. The `auth.users` row needs the admin API.
-- So `erase_me` does the database's half and writes down what it could not
-- reach, `pending_erasures` is what a job holding the service key reads, and
-- `finish_erasure` closes the request. Same three-step shape as the evidence
-- retention pair in `0009`, and for the same reason.

-- ---------------------------------------------------------------------------
-- The register
-- ---------------------------------------------------------------------------
--
-- The issue's "done when" is that every personal-data table has a purpose, a
-- lawful basis, a retention period and a deletion rule. That sentence is only
-- worth something if it can fail, so the register is a table rather than a
-- paragraph in a document, and `unregistered_tables` below is the check.
--
-- The point is not the rows. It is that the next migration to add a table has
-- to answer four questions before the test goes green again.

do $$
begin
  create type public.lawful_basis as enum (
    -- Article 6(1)(a)..(f), by their usual names.
    'consent',
    'contract',
    'legal_obligation',
    'vital_interests',
    'public_task',
    'legitimate_interests',
    -- Not a basis. For a table that holds no personal data at all, which needs
    -- to be a stated finding rather than an empty cell.
    'not_applicable'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.data_inventory (
  table_name text primary key,

  -- What it is for, in one sentence. Article 5(1)(b): a purpose recorded after
  -- the fact tends to be a description of whatever the data is being used for.
  purpose text not null check (length(btrim(purpose)) > 0),

  -- Whose data it is. A report is the reporter's, the blocked driver's and the
  -- resolver's at once, and a register that says only "users" hides the one
  -- data subject who never agreed to anything.
  subjects text not null check (length(btrim(subjects)) > 0),

  personal boolean not null,
  lawful_basis public.lawful_basis not null,

  retention text not null check (length(btrim(retention)) > 0),
  deletion_rule text not null check (length(btrim(deletion_rule)) > 0),

  -- Free text, for the entries that need a caveat rather than a rule.
  note text,

  reviewed_at timestamptz not null default now(),

  -- Keeps the two columns honest about each other. A table with no personal
  -- data has no lawful basis to state, and a table with one cannot claim it
  -- holds nothing.
  constraint data_inventory_basis_matches_personal check (
    (personal and lawful_basis <> 'not_applicable')
    or (not personal and lawful_basis = 'not_applicable')
  )
);

comment on table public.data_inventory is
  'The retention register. Every table in public appears here or the check fails.';

/**
 * Tables nobody has classified.
 *
 * The whole value of the register. `relkind = ''r''` is ordinary tables only:
 * views inherit their tables'' classification and have no storage of their own,
 * and this migration''s own bookkeeping is registered like everything else.
 */
create or replace function public.unregistered_tables()
returns table (table_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.relname::text
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname not in (select i.table_name from public.data_inventory i)
  order by 1
$$;

comment on function public.unregistered_tables() is
  'Public tables with no purpose, basis, retention or deletion rule. Should be empty.';

-- ---------------------------------------------------------------------------
-- The delete rules that were wrong
-- ---------------------------------------------------------------------------

/*
 * An official act outlives the person who performed it.
 *
 * `actor` becomes nullable and severs instead of cascading. A null actor is
 * not missing data -- it says the person has been erased, and the row is still
 * true about what was done and by which office. `organisation_id` is what
 * carries a resolution's authority anyway; the uuid was only ever the audit
 * trail behind it.
 *
 * For a `cleared` event there is no organisation, so erasure leaves an
 * unattributed observation. That is the honest outcome and it is why `cleared`
 * has never been worth as much as `resolved`.
 */
alter table public.report_events drop constraint if exists report_events_actor_fkey;
alter table public.report_events alter column actor drop not null;
alter table public.report_events
  add constraint report_events_actor_fkey
  foreign key (actor) references auth.users (id) on delete set null;

comment on column public.report_events.actor is
  'Who did it. Null once they have been erased; the act and its office remain.';

/*
 * The audit log stops being a way to make yourself undeletable.
 *
 * The foreign key goes entirely rather than becoming `set null`, and the
 * column stays `not null`, because those are the two halves of the same
 * decision: this log is read to answer "who looked at my photographs", and a
 * page of nulls answers nobody. The uuid is kept deliberately, past the
 * account it identified, under Article 17(3)(e) -- it is the evidence for a
 * claim by a *third party*, the person whose evidence was opened, whose
 * interest does not end when the person who opened it closes their account.
 *
 * That exemption is not open-ended and it is not a licence to keep the log
 * forever: `forget_old_evidence_access` below expires it at 24 months, and the
 * register says so out loud.
 */
alter table public.evidence_access drop constraint if exists evidence_access_looked_by_fkey;

comment on column public.evidence_access.looked_by is
  'Kept after erasure, for 24 months. The subject of this row is not its author.';

/*
 * `reports.created_by` keeps cascading, and that is now a decision.
 *
 * Recorded here because the alternative was live for a while: sever the author
 * and keep the complaint, the way a public spot keeps its contribution. It was
 * rejected. A report is a photograph of a stranger's car outside a stranger's
 * house, and the person who chose to take it is the person whose withdrawal
 * should end it. Keeping an unattributed complaint would mean the reporter can
 * leave but the driver they photographed cannot get the picture taken down.
 */
comment on column public.reports.created_by is
  'The author. Deleting the account deletes the report; see 0012 for why.';

-- ---------------------------------------------------------------------------
-- One more column that was public and did not need to be
-- ---------------------------------------------------------------------------
--
-- `0006` hid the plate and `0009` hid the photographs, and both left
-- `created_by` where it was, because a uuid is not a name. What a uuid *is*, on
-- a table whose select policy is `using (true)`, is a join key:
--
--     select created_by, latitude, longitude, created_at from reports_readable
--
-- with the anon key that ships inside the app returns every complaint in
-- Bucharest grouped by the person who filed it -- which is where somebody was,
-- and when, over as long as they have used this. Pseudonymous until one report
-- can be tied to a person, and one is enough: a driver who mentions having
-- reported a particular blockage has handed over the key to all of their
-- others.
--
-- WHY THIS COSTS THE APP NOTHING. Every use of the column in the client is
-- `report.reportedBy === account.id` -- `isMine`, and `mayEdit` and
-- `mayViewEvidence` through it. An id that is null for everybody else's
-- reports answers those three questions exactly as it did before, which is why
-- this is a column being hidden rather than a feature being removed.
--
-- The table grant goes with it, or the view would be a formality: `0009` hands
-- out `select (…, created_by, …)` on `reports` itself, so a stranger could ask
-- the table the question the view had stopped answering.

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
  case when created_by = (select auth.uid()) then created_by end as created_by,
  created_at
from public.reports;

comment on view public.reports_readable is
  'Reports as the app may read them: the plate, the evidence and the author are the author''s.';

-- Re-applied, not inherited. A recreated view is a new object and picks up
-- Supabase's default privileges again -- including `insert`, `update` and
-- `delete`, which are not inert here: one table in `from`, no grouping and no
-- aggregate makes this automatically updatable, and 0009's header explains at
-- length what that cost the first time.
revoke all on public.reports_readable from public, anon, authenticated;
grant select on public.reports_readable to anon, authenticated, service_role;

revoke select on public.reports from anon, authenticated;
grant select (
  id,
  category,
  latitude,
  longitude,
  address,
  note,
  created_at
) on public.reports to anon, authenticated;

-- ---------------------------------------------------------------------------
-- What survives a withdrawal
-- ---------------------------------------------------------------------------

create table if not exists public.official_resolutions (
  id bigint generated always as identity primary key,

  -- Null once the report has gone. The severing *is* the de-identification:
  -- while this points at a report it is that report's author's data by
  -- association, and the register says so rather than claiming the row was
  -- anonymous all along.
  report_id text references public.reports (id) on delete set null,

  organisation_id text not null references public.organisations (id),

  -- Copied, not joined. A foreign key here would be a second way to reach the
  -- report after the first was cut.
  category text not null,
  sector public.jurisdiction,

  reported_at timestamptz not null,
  resolved_at timestamptz not null default now()
);

create index if not exists official_resolutions_office_idx
  on public.official_resolutions (organisation_id, resolved_at desc);

comment on table public.official_resolutions is
  'That an office closed a case. Survives the report; never held who reported it.';

/**
 * Write the ledger entry when an institution resolves something.
 *
 * `after insert`, so it runs behind `refuse_resolving_out_of_turn` and records
 * only rows that were actually accepted, with the `organisation_id` that
 * trigger stamped rather than the one the client sent.
 */
create or replace function public.record_an_official_resolution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  about public.reports%rowtype;
begin
  if new.kind <> 'resolved' or new.organisation_id is null then
    return null;
  end if;

  select * into about from public.reports where id = new.report_id;

  if not found then
    return null;
  end if;

  insert into public.official_resolutions (
    report_id, organisation_id, category, sector, reported_at, resolved_at
  )
  values (
    new.report_id, new.organisation_id, about.category, about.sector,
    about.created_at, new.created_at
  );

  return null;
end;
$$;

drop trigger if exists report_events_are_ledgered on public.report_events;
create trigger report_events_are_ledgered
  after insert on public.report_events
  for each row execute function public.record_an_official_resolution();

-- ---------------------------------------------------------------------------
-- Article 17: make it stop
-- ---------------------------------------------------------------------------

create table if not exists public.erasure_requests (
  -- No foreign key, on purpose. This row has to outlive the account it names,
  -- or the only proof that a request was honoured is destroyed by honouring it.
  user_id uuid primary key,

  requested_at timestamptz not null default now(),

  -- When the rows went. Set by `erase_me` in the same transaction.
  database_done_at timestamptz,

  -- When the photographs and the login went. Only a holder of the service key
  -- can set this, because only they could do the work.
  completed_at timestamptz,

  -- What the database could not reach, for whoever finishes the job.
  storage_prefix text
);

comment on table public.erasure_requests is
  'That somebody asked to be forgotten, and when each half of it was done.';

-- ---------------------------------------------------------------------------
-- Article 15 and 20: what do you have about me
-- ---------------------------------------------------------------------------

/**
 * Everything this database holds about the caller, as one document.
 *
 * `security definer` for one reason: it returns the caller their *own* plate
 * and their own photo paths, which `reports_readable` deliberately hides from
 * everybody -- including, through the view, from them. It reads `reports`
 * directly and filters by `auth.uid()` itself. Every branch below is keyed on
 * that uid; there is no argument, because a function that took a user id would
 * be one missing check away from being an export of somebody else.
 *
 * `evidence_access` is included and it is the part worth having: it is the
 * only way a driver finds out that a warden opened their photographs, which is
 * a disclosure of their data to a third party and is exactly what Article 15
 * entitles them to know about.
 */
create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'Only a signed-in account can be exported'
      using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'exported_at', now(),
    'account', jsonb_build_object('id', me),

    'profile', (
      select to_jsonb(p) from public.profiles p where p.id = me
    ),

    'roles', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.granted_at)
      from public.user_roles r where r.user_id = me
    ), '[]'::jsonb),

    -- The full row, plate and photo paths included. The paths are not the
    -- pictures; a client turns them into files with the signing route from
    -- 0009, which is the author's own evidence and needs no log.
    'reports', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at)
      from public.reports r where r.created_by = me
    ), '[]'::jsonb),

    -- What they did about other people's reports, which is their data too.
    'actions_on_reports', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at)
      from public.report_events e where e.actor = me
    ), '[]'::jsonb),

    'spots', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.id)
      from public.spots s where s.owner_id = me or s.created_by = me
    ), '[]'::jsonb),

    'availability_windows', coalesce((
      select jsonb_agg(to_jsonb(w) order by w.id)
      from public.availability_windows w where w.owner_id = me
    ), '[]'::jsonb),

    'who_opened_my_evidence', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'report_id', a.report_id, 'as_role', a.as_role, 'looked_at', a.looked_at
        ) order by a.looked_at
      )
      from public.evidence_access a
      join public.reports r on r.id = a.report_id
      where r.created_by = me
    ), '[]'::jsonb),

    'erasure_requests', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.requested_at)
      from public.erasure_requests x where x.user_id = me
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.export_my_data() is
  'Article 15 and 20. Everything about the caller, including who read their evidence.';

/**
 * Erase the caller.
 *
 * Deletes rather than anonymises, which is the choice this migration's header
 * explains. What it cannot delete it writes down.
 *
 * The order matters. Reports go before anything else touches storage, so a
 * crash halfway leaves photographs whose rows are gone -- recoverable, because
 * `pending_erasures` still names the prefix -- rather than rows pointing at
 * files that are gone, which is the failure `0009` had to design around.
 *
 * Public spots are severed rather than deleted. A community contribution that
 * a car park exists is not personal data about the contributor once their name
 * is off it, and deleting it would take a real place off the map for everybody
 * because one person left. The same holds for a `residential_permit` bay: the
 * city painted it, the permit merely said who may use it, and the paint is
 * still there when the holder closes their account.
 *
 * `private_property` is the opposite and the only kind that goes. It is
 * somebody's garage, listed by them, discoverable only because they said so.
 */
create or replace function public.erase_me()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  gone jsonb;
  reports_gone integer;
  spots_gone integer;
  windows_gone integer;
  actions_severed integer;
begin
  if me is null then
    raise exception 'Only a signed-in account can be erased'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.erasure_requests (user_id, storage_prefix)
  values (me, me::text || '/')
  on conflict (user_id) do nothing;

  -- Their complaints, and with each one its history and its evidence rows.
  -- `official_resolutions.report_id` severs here rather than cascading, which
  -- is the whole of what an institution keeps.
  with removed as (
    delete from public.reports where created_by = me returning 1
  )
  select count(*) into reports_gone from removed;

  with removed as (
    delete from public.availability_windows where owner_id = me returning 1
  )
  select count(*) into windows_gone from removed;

  with removed as (
    delete from public.spots
    where owner_id = me and access = 'private_property'
    returning 1
  )
  select count(*) into spots_gone from removed;

  update public.spots
  set owner_id = null, owner_name = null
  where owner_id = me;

  update public.spots set created_by = null where created_by = me;

  -- What they did about other people's reports. The rows stay; the name goes.
  with severed as (
    update public.report_events set actor = null
    where actor = me returning 1
  )
  select count(*) into actions_severed from severed;

  delete from public.user_roles where user_id = me;

  -- The profile row is cascaded by the `auth.users` delete, but that happens in
  -- another process at another time, and a display name is the one column here
  -- that names a person to strangers. It goes now.
  delete from public.profiles where id = me;

  update public.erasure_requests
  set database_done_at = now()
  where user_id = me;

  gone := jsonb_build_object(
    'reports_deleted', reports_gone,
    'availability_windows_deleted', windows_gone,
    'private_spots_deleted', spots_gone,
    'actions_kept_unattributed', actions_severed,
    'storage_prefix', me::text || '/',
    -- Said in the return value because the client shows it: the account is not
    -- gone at the moment this returns, and telling somebody it is would be the
    -- one lie in a privacy screen.
    'login_and_photos_pending', true
  );

  return gone;
end;
$$;

comment on function public.erase_me() is
  'Deletes the caller''s rows and records what only the service key can finish.';

/**
 * The work a job with the service key still has to do.
 *
 * Two steps, in this order: delete everything under `storage_prefix` through
 * the storage API, then delete the `auth.users` row through the admin API,
 * then call `finish_erasure`. The prefix is deleted first for the same reason
 * as in `0009` -- losing the pointer before the bytes leaves the bytes forever.
 */
create or replace function public.pending_erasures()
returns table (user_id uuid, requested_at timestamptz, storage_prefix text)
language sql
stable
security definer
set search_path = ''
as $$
  select x.user_id, x.requested_at, x.storage_prefix
  from public.erasure_requests x
  where x.completed_at is null
  order by x.requested_at
$$;

comment on function public.pending_erasures() is
  'Erasures whose photographs and login are still there. For a service-key job.';

create or replace function public.finish_erasure(wanted uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.erasure_requests
  set completed_at = now()
  where user_id = wanted and completed_at is null
$$;

comment on function public.finish_erasure(uuid) is
  'Closes a request. Call it after the storage prefix and the login are gone.';

-- ---------------------------------------------------------------------------
-- Retention, for the data nobody asked to be forgotten
-- ---------------------------------------------------------------------------
--
-- `0009` expires the photographs at twelve months. It left the column that the
-- plate was typed off, which is the shorter, sharper piece of the same fact:
-- a registration number is a person's car with no picture needed, it is the
-- one column `0006` went to the trouble of hiding from strangers, and it was
-- being kept forever on a row that is readable by everybody.

/**
 * Clear the plates off reports past their retention.
 *
 * The complaint survives without it. "A car blocked this ramp on the 3rd of
 * March" is the part that is still true and still useful a year later; *which*
 * car stopped being anybody's business at the same moment the photograph did.
 */
create or replace function public.forget_report_plates(
  older_than interval default '12 months'
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
    update public.reports
    set plate = null
    where created_at < now() - older_than
      and plate is not null
    returning 1
  )
  select count(*) into gone from cleared;

  return gone;
end;
$$;

comment on function public.forget_report_plates(interval) is
  'Drops registration numbers from old reports. The complaint stays.';

/**
 * Expire the evidence access log.
 *
 * The counterweight to keeping a uuid past its account. Twenty-four months is
 * longer than the twelve the evidence itself gets, deliberately: the log is
 * how a driver would find out their photographs were opened, and it has to
 * outlast the thing it is a record of or it could never be used to complain.
 */
create or replace function public.forget_old_evidence_access(
  older_than interval default '24 months'
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
    delete from public.evidence_access
    where looked_at < now() - older_than
    returning 1
  )
  select count(*) into gone from cleared;

  return gone;
end;
$$;

comment on function public.forget_old_evidence_access(interval) is
  'Expires the disclosure log at 24 months, which is the limit of its exemption.';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.data_inventory enable row level security;
alter table public.official_resolutions enable row level security;
alter table public.erasure_requests enable row level security;

drop policy if exists "The register is public" on public.data_inventory;
create policy "The register is public"
  on public.data_inventory for select
  using (true);

-- What a sector hall has closed is a public fact about a public body, and the
-- rows hold nothing about any person once their link is cut.
drop policy if exists "An office's record of its work is public" on public.official_resolutions;
create policy "An office's record of its work is public"
  on public.official_resolutions for select
  using (true);

drop policy if exists "A person sees their own erasure request" on public.erasure_requests;
create policy "A person sees their own erasure request"
  on public.erasure_requests for select
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Who may call any of this
-- ---------------------------------------------------------------------------
--
-- Grantees named one at a time, for the reason `0009` had to learn twice:
-- `revoke ... from public` leaves Supabase's default privileges standing, and
-- those name `anon` and `authenticated` explicitly on every new function.

revoke all on function public.unregistered_tables() from public, anon, authenticated;
revoke all on function public.pending_erasures() from public, anon, authenticated;
revoke all on function public.finish_erasure(uuid) from public, anon, authenticated;
revoke all on function public.forget_report_plates(interval) from public, anon, authenticated;
revoke all on function public.forget_old_evidence_access(interval) from public, anon, authenticated;
revoke all on function public.record_an_official_resolution() from public, anon, authenticated;

grant execute on function public.unregistered_tables() to service_role;
grant execute on function public.pending_erasures() to service_role;
grant execute on function public.finish_erasure(uuid) to service_role;
grant execute on function public.forget_report_plates(interval) to service_role;
grant execute on function public.forget_old_evidence_access(interval) to service_role;

-- Both of these are keyed on `auth.uid()` and refuse without one. An anonymous
-- session is granted them on purpose: `signInAnonymously` has been minting
-- accounts since 0001, those accounts file reports, and an export that only
-- worked once somebody had signed up would exclude most of the people who have
-- data here.
revoke all on function public.export_my_data() from public;
revoke all on function public.erase_me() from public;
grant execute on function public.export_my_data() to anon, authenticated, service_role;
grant execute on function public.erase_me() to anon, authenticated, service_role;

-- No client writes the register or the ledger. Both are written by migrations
-- and triggers, and a ledger anybody can insert into is not evidence of
-- anything.
revoke all on table public.data_inventory from public, anon, authenticated;
revoke all on table public.official_resolutions from public, anon, authenticated;
revoke all on table public.erasure_requests from public, anon, authenticated;

grant select on table public.data_inventory to anon, authenticated, service_role;
grant select on table public.official_resolutions to anon, authenticated, service_role;
grant select on table public.erasure_requests to anon, authenticated, service_role;
grant insert, update on table public.erasure_requests to service_role;

-- ---------------------------------------------------------------------------
-- The register itself
-- ---------------------------------------------------------------------------
--
-- `on conflict do update` rather than `do nothing`: this is the one table a
-- later migration is expected to correct, and a seed that silently kept the
-- old answer would let the register drift away from the schema it describes.

insert into public.data_inventory
  (table_name, purpose, subjects, personal, lawful_basis, retention, deletion_rule, note)
values
  (
    'spots',
    'The register of places to park: where they are, who may use them, what they cost.',
    'Owners and contributors of private and community spots.',
    true,
    'legitimate_interests',
    'For as long as the place exists. Imported rows hold nobody''s data.',
    'Erasure deletes the private property they own and severs their name from everything else.',
    'The overwhelming majority of rows are imported from OpenStreetMap and CMPB and are about places, not people. A residential permit bay survives its holder: the city painted it, and the paint is not personal data.'
  ),
  (
    'availability_windows',
    'When an owner is willing to let their private spot be used.',
    'Owners of private spots.',
    true,
    'contract',
    'Until withdrawn by the owner or the spot is removed.',
    'Deleted outright on erasure, and cascaded when the spot or the account goes.',
    null
  ),
  (
    'reports',
    'A complaint that a place is blocked, so that somebody with authority can act.',
    'The reporter, and the driver of the vehicle they photographed.',
    true,
    'legitimate_interests',
    'The complaint is kept. The plate is cleared at 12 months and the photographs at 12 months.',
    'Deleted in full when the reporter is erased.',
    'The blocked driver never agreed to anything, which is why 0006 hid the plate, 0009 took the photographs private, and forget_report_plates now expires it.'
  ),
  (
    'report_events',
    'What was done about a complaint: forwarded, cleared by a passer-by, resolved by an office.',
    'The person who acted, and the reporter by association with the complaint.',
    true,
    'legitimate_interests',
    'For as long as the report it belongs to.',
    'The actor is severed on erasure and the row survives unattributed; the row is deleted with its report.',
    'Append-only. Nothing edits an event after it is filed.'
  ),
  (
    'profiles',
    'What somebody chooses to be called, and whether they say they act as a trader.',
    'Every account holder.',
    true,
    'contract',
    'For the life of the account.',
    'Deleted immediately on erasure, ahead of the account itself.',
    'The trader declaration is dated because the obligations attach from the moment it is made.'
  ),
  (
    'user_roles',
    'What the project says a person may do: moderate, resolve on behalf of an office, administer.',
    'Account holders who hold a grant.',
    true,
    'legitimate_interests',
    'For as long as the grant stands.',
    'Deleted on erasure.',
    'No client may write this table; grants are made out of band. An anonymous account may not hold one.'
  ),
  (
    'evidence_access',
    'That somebody who did not file a report opened its photographs, and on what authority.',
    'The person who looked, and the reporter whose evidence was opened.',
    true,
    'legal_obligation',
    '24 months, then deleted by forget_old_evidence_access.',
    'Exempt from erasure for its retention period under Article 17(3)(e); the uuid is kept after the account goes.',
    'The only table here whose subject and beneficiary are different people, which is why the looker cannot erase it. The reporter can: these rows are cascaded by the deletion of the report they are about, so erasing an author also destroys the record of who read their evidence -- which is the outcome they asked for.'
  ),
  (
    'organisations',
    'Which institutions may resolve complaints, and where their authority runs.',
    'None. A sector hall is not a person.',
    false,
    'not_applicable',
    'Indefinite. Suspension is a dated column, not a deletion.',
    'Not deleted; an office that should stop acting is given an end date.',
    null
  ),
  (
    'official_resolutions',
    'That a public body closed a case: which office, what kind, which sector, when.',
    'Nobody, once the link to the report is cut. The reporter by association until then.',
    true,
    'legitimate_interests',
    'Indefinite, and de-identified automatically when its report is deleted.',
    'Not deleted by erasure. The link severs and what remains names no one.',
    'The single exception to erasure in this schema, and the reason is that an official act is not the private property of the person who triggered it.'
  ),
  (
    'erasure_requests',
    'That somebody asked to be forgotten, and when each half of it was carried out.',
    'People who have asked for erasure.',
    true,
    'legal_obligation',
    '3 years, as the proof that Article 12(3) was met.',
    'Not deleted by the erasure it records; it is what demonstrates the erasure happened.',
    'Deliberately has no foreign key to auth.users, or honouring a request would destroy the evidence that it was honoured.'
  ),
  (
    'data_inventory',
    'This register.',
    'None.',
    false,
    'not_applicable',
    'Indefinite.',
    'Not deleted. Corrected by migrations.',
    null
  )
on conflict (table_name) do update set
  purpose = excluded.purpose,
  subjects = excluded.subjects,
  personal = excluded.personal,
  lawful_basis = excluded.lawful_basis,
  retention = excluded.retention,
  deletion_rule = excluded.deletion_rule,
  note = excluded.note,
  reviewed_at = now();
