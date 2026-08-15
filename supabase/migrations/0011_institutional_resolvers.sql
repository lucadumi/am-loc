-- Who is entitled to close a complaint, and where.
--
-- `0008` added a `resolver` role and stopped there: it says somebody is a
-- resolver and nothing about *which* institution they are or *where* their
-- writ runs. That was the right amount for a role that only guarded reading
-- evidence. It is not enough to close a complaint, for two reasons that both
-- end in the same place.
--
-- A resolver is not a person, it is an office. The uuid belongs to whoever sits
-- at the desk this month, and the authority belongs to the sector hall. When
-- somebody leaves, the account should stop working without the reports they
-- closed becoming unattributable -- so what closed a report has to be recorded
-- as the organisation, not only as the person.
--
-- And a sector hall's authority stops at its boundary. Bucharest has six
-- sectors and each has its own administration; Sector 2 closing a complaint
-- about a pavement in Sector 5 is not a resolution, it is a mistake nobody
-- notices until the car is still there a month later.
--
-- ---
--
-- THE ONE PLACE THIS MIGRATION CONTRADICTS AN EARLIER DECISION, deliberately
-- and after being asked.
--
-- `0003` let anybody signed in add a `resolved` event, and gave a reason worth
-- keeping: "the person who goes back and looks is rarely the person who
-- complained". The issue this migration closes says the opposite -- a normal
-- user may not resolve a report.
--
-- Both are right about different things, and `0003` collapsed them into one
-- word. A passer-by seeing a clear pavement is making an *observation*; it is
-- useful, and it is the only thing that keeps the map current, because a sector
-- hall answers in weeks. An institution *resolving* a complaint is an official
-- act that closes a file. So the two are separated rather than one of them
-- being taken away:
--
--   `cleared`  -- anybody signed in, with a photograph. "I walked past and it
--                 is gone."
--   `resolved` -- a verified resolver whose jurisdiction covers the place.
--                 The complaint is closed.
--
-- `0003`'s reasoning survives intact and the refusal the issue asks for is
-- real: a driver attempting to `resolve` is refused by the database.

-- ---------------------------------------------------------------------------
-- The institution
-- ---------------------------------------------------------------------------

do $$
begin
  create type public.organisation_kind as enum (
    -- A sector town hall: Primăria Sectorului 1..6.
    'sector_hall',
    -- Poliția Locală, per sector.
    'local_police',
    -- Poliția Română. Only ever set for an actual police authority: the label
    -- shown on screen turns on this, and calling a contractor "Poliția" is a
    -- claim about power over a driver that nobody made.
    'police',
    -- Primăria Municipiului București and the companies it owns, CMPB included.
    'city_hall',
    -- Anything verified and none of the above. Reads as "Cont instituțional
    -- verificat", which is the honest label for an organisation whose kind the
    -- app is not prepared to assert.
    'other'
  );
exception
  when duplicate_object then null;
end
$$;

/**
 * Where an organisation's writ runs.
 *
 * Sectors 1 to 6, and `city` for a body whose authority covers all of them.
 * Deliberately not free text: a jurisdiction that can be typed is a
 * jurisdiction that can be typed as `Sector 2 ` and silently match nothing.
 */
do $$
begin
  create type public.jurisdiction as enum (
    'sector_1', 'sector_2', 'sector_3',
    'sector_4', 'sector_5', 'sector_6',
    'city'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.organisations (
  id text primary key,
  name text not null check (length(btrim(name)) > 0),
  kind public.organisation_kind not null,
  jurisdiction public.jurisdiction not null,

  /**
   * When somebody last checked that this is who they say they are.
   *
   * Not null, because an unverified organisation is not one: the row exists
   * because a person read a document. What that verification consisted of goes
   * in `note`, so a grant made in error can be traced to the paperwork that
   * justified it rather than to somebody's memory.
   */
  verified_at timestamptz not null default now(),
  /**
   * When that check goes stale.
   *
   * Null means it does not, which is right for a sector hall -- it will still
   * be the sector hall next year. A dated one is for anything delegated: a
   * contractor's mandate, a pilot.
   */
  expires_on date,
  /**
   * Set when an organisation should stop acting without being forgotten.
   *
   * Suspension is reversible and revocation is not, and the difference is a
   * sentence rather than a column: what matters to every check below is that
   * this is not null. It is separate from deleting the row because the reports
   * they closed have to keep naming them.
   */
  suspended_at timestamptz,
  note text,

  created_at timestamptz not null default now()
);

comment on table public.organisations is
  'A body entitled to close complaints, and where. Written by nobody but service_role.';

/**
 * Whether an organisation may act at this moment.
 *
 * Three ways to be unable to, and they are checked in one place so that a
 * policy written later cannot check two of them: suspended, expired, or gone.
 */
create or replace function public.organisation_is_active(org text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organisations o
    where o.id = org
      and o.suspended_at is null
      and (o.expires_on is null or o.expires_on >= current_date)
  )
$$;

-- ---------------------------------------------------------------------------
-- Who works for whom
-- ---------------------------------------------------------------------------
--
-- A column on `user_roles` rather than a table of its own. The grant and the
-- organisation are one fact -- "this account acts for the sector hall" -- and
-- splitting them would allow the two halves to disagree: a resolver grant with
-- no organisation is an account with authority over nobody's reports in
-- particular, which is the state the trigger below refuses to create.

alter table public.user_roles
  add column if not exists organisation_id text references public.organisations (id);

/**
 * A resolver acts for somebody, and only a resolver does.
 *
 * Both directions matter. A resolver without an organisation would pass every
 * `has_role('resolver')` check in the schema while belonging to no
 * jurisdiction, so the jurisdiction test below would have nothing to compare
 * against -- and a check that cannot fail is not a check. A host or an admin
 * *with* one would be an account whose organisation means nothing, which is
 * how a column comes to be read as permission somewhere it was never intended.
 */
create or replace function public.refuse_a_resolver_without_an_office()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'resolver' and new.organisation_id is null then
    raise exception 'A resolver grant must name the organisation it acts for'
      using errcode = 'integrity_constraint_violation';
  end if;

  if new.role <> 'resolver' and new.organisation_id is not null then
    raise exception 'Only a resolver grant carries an organisation'
      using errcode = 'integrity_constraint_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists user_roles_resolvers_have_an_office on public.user_roles;
create trigger user_roles_resolvers_have_an_office
  before insert or update on public.user_roles
  for each row execute function public.refuse_a_resolver_without_an_office();

/**
 * The organisation this session may act for, if any.
 *
 * Null for everybody else, and null for a resolver whose organisation is
 * suspended or expired -- so a caller that asks this question gets one answer
 * covering all three ways to be unable to act, rather than remembering to ask
 * three.
 *
 * Built on `has_role`, so the second factor is enforced here too: a resolver
 * who signed in with only a password acts for nobody until they are
 * challenged.
 */
create or replace function public.acting_organisation()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.organisation_id
  from public.user_roles r
  where r.user_id = (select auth.uid())
    and r.role = 'resolver'
    and public.has_role('resolver')
    and public.organisation_is_active(r.organisation_id)
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- Where a report is
-- ---------------------------------------------------------------------------
--
-- A jurisdiction cannot be compared against a report that does not carry one.
--
-- WHY THE COLUMN IS NULLABLE AND WHY THE CLIENT FILLS IT. Bucharest's sector
-- boundaries are polygons and Postgres cannot test a point against one without
-- PostGIS, which this project does not enable. The app already has the
-- polygons and already does this arithmetic -- `scripts/fetch-areas.mjs` places
-- 838 car parks that way -- so the sector is computed on the device when the
-- report is filed, from bundled boundaries, with no network call.
--
-- Null therefore means "the app could not place it": an older client, or a
-- point outside all six polygons. Those reports are visible to every resolver
-- rather than to none, because a complaint nobody can be responsible for is
-- worse than one two people look at.

alter table public.reports
  add column if not exists sector public.jurisdiction;

comment on column public.reports.sector is
  'Which sector the blockage is in, placed on the device. Null when unplaceable.';

create index if not exists reports_sector_idx on public.reports (sector);

/**
 * Whether this session may act on a particular report.
 *
 * `city` covers everything, a sector covers its own, and a report with no
 * sector is covered by anybody -- see the note above on why that is the safe
 * direction rather than the lax one.
 */
create or replace function public.may_resolve(wanted_report text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.reports r
    join public.organisations o
      on o.id = public.acting_organisation()
    where r.id = wanted_report
      and (
        o.jurisdiction = 'city'
        or r.sector is null
        or r.sector = o.jurisdiction
      )
  )
$$;

-- ---------------------------------------------------------------------------
-- Closing a complaint, and saying a kerb is clear
-- ---------------------------------------------------------------------------

alter table public.report_events drop constraint if exists report_events_kind_check;
alter table public.report_events
  add constraint report_events_kind_check
  check (kind in ('forwarded', 'cleared', 'resolved'));

-- What closed it, as an institution rather than as a uuid. Null for a
-- `cleared`, which is a passer-by and not an office.
alter table public.report_events
  add column if not exists organisation_id text references public.organisations (id);

-- An institution's own words about what it did: the file number, what was
-- ordered, why it was refused. Not shown to the public by anything yet, and
-- recorded from the start because a note added later has no history.
alter table public.report_events
  add column if not exists note text;

/**
 * Only an entitled resolver may resolve; anybody may say a kerb is clear.
 *
 * The refusal the issue asks for, and it lives in a trigger rather than in the
 * insert policy for a reason worth stating: a policy that refused the row would
 * report "new row violates row-level security", which tells a warden nothing
 * about *why* -- and the three reasons are different problems with different
 * fixes. Suspended is a call to the office; out of jurisdiction is the wrong
 * warden; not a resolver at all is somebody who should be pressing the other
 * button.
 */
create or replace function public.refuse_resolving_out_of_turn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  org text;
begin
  if new.kind <> 'resolved' then
    -- A passer-by's observation. The photograph is demanded by the constraint
    -- from 0003, which covers both closing kinds.
    if new.organisation_id is not null then
      raise exception 'Only a resolution is filed on behalf of an organisation'
        using errcode = 'integrity_constraint_violation';
    end if;
    return new;
  end if;

  org := public.acting_organisation();

  if org is null then
    raise exception
      'Only a verified institution may resolve a report; anybody may mark a kerb cleared'
      using errcode = 'insufficient_privilege';
  end if;

  if not public.may_resolve(new.report_id) then
    raise exception 'This report is outside your jurisdiction'
      using errcode = 'insufficient_privilege';
  end if;

  -- Stamped, not accepted. A resolver could otherwise close a report in
  -- another organisation's name.
  new.organisation_id := org;
  return new;
end;
$$;

drop trigger if exists report_events_resolution_is_official on public.report_events;
create trigger report_events_resolution_is_official
  before insert on public.report_events
  for each row execute function public.refuse_resolving_out_of_turn();

-- The constraint from 0003 demanded a photograph for `resolved`. `cleared` is
-- the same claim made by somebody with less standing, so it costs the same.
alter table public.report_events drop constraint if exists report_events_resolution_needs_proof;
alter table public.report_events
  add constraint report_events_resolution_needs_proof
  check (
    kind = 'forwarded' or coalesce(array_length(photos, 1), 0) > 0
  );

-- ---------------------------------------------------------------------------
-- Reading the evidence
-- ---------------------------------------------------------------------------
--
-- `0009` let any resolver read any report's evidence, because there was no
-- jurisdiction to compare against. There is now, and a warden in Sector 2 has
-- no business with the number plates photographed in Sector 5.

create or replace function public.evidence_paths(wanted_report text)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid;
  found text[];
  org text;
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

  org := public.acting_organisation();

  if org is null or not public.may_resolve(wanted_report) then
    raise exception 'Not entitled to this report''s evidence'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.evidence_access (report_id, looked_by, as_role)
  values (wanted_report, (select auth.uid()), 'resolver');

  return found;
end;
$$;

grant execute on function public.evidence_paths(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security and grants
-- ---------------------------------------------------------------------------

alter table public.organisations enable row level security;

-- Public, and it has to be: a resolved report names the body that resolved it,
-- and a name nobody can look up is not attribution. Nothing here is private --
-- who the sector halls are is not a secret.
drop policy if exists "Organisations are readable by everybody" on public.organisations;
create policy "Organisations are readable by everybody"
  on public.organisations for select
  to anon, authenticated
  using (true);

grant select on public.organisations to anon, authenticated;

/**
 * THE LINE THAT MAKES VERIFICATION MEAN ANYTHING.
 *
 * Supabase grants every privilege on a new table to `anon` and `authenticated`
 * through its default privileges, so this is a revoke rather than an omission
 * -- the same trap `0009` documents twice, once for a function and once for a
 * view. Without it, the anon key that ships inside the app could insert an
 * organisation called "Poliția Română" and grant it the whole city.
 *
 * There is deliberately no interface for creating one. An organisation is a
 * row somebody writes after reading a document, as `service_role`.
 */
revoke insert, update, delete on public.organisations from anon, authenticated;

-- `user_roles` gained a column; its grants are unchanged and already exclude
-- every write. Stated rather than assumed, because a column added to a table
-- is exactly when a `grant select (…)` list goes stale.
revoke insert, update, delete on public.user_roles from anon, authenticated;

grant execute on function public.organisation_is_active(text) to authenticated;
grant execute on function public.acting_organisation() to authenticated;
grant execute on function public.may_resolve(text) to authenticated;
