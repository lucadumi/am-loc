-- Blocker reports: a car on a pavement, a ramp, a crossing.
--
-- Two tables again, and for the same reason as spots: `reports` is the
-- complaint, `report_events` is what anybody did about it. There is no
-- `status` column. Where a report got to is a history, not a property, and a
-- column would be one mutable field that whoever wrote last owns.
--
-- `toBlockerReport` in lib/supabase-rows.ts derives the status from the newest
-- event, so a report nobody has acted on is open by construction -- the one
-- definition of "open" that cannot drift, because there is nothing to forget
-- to update.

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------

create table if not exists public.reports (
  -- Client-generated (`r_<millis>_<rand>`), because `addReport` builds the
  -- whole report -- photographs and all -- before anything is written, and the
  -- photo upload path is keyed on the id it already has.
  id text primary key,

  category text not null check (
    category in ('sidewalk', 'ramp', 'crosswalk', 'bikelane', 'doublepark')
  ),

  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),

  address text,
  plate text,
  note text,

  -- Public URLs in `report-photos`, in the order they were taken. Not null,
  -- with an empty array for a report with no pictures: `toBlockerReport` reads
  -- `row.photos.length`, and a null there would be a crash rather than an
  -- absence.
  photos text[] not null default '{}',

  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists reports_recent_idx on public.reports (created_at desc);
create index if not exists reports_author_idx on public.reports (created_by);

comment on table public.reports is
  'A complaint about a place at a moment. Where it got to lives in report_events.';

-- ---------------------------------------------------------------------------
-- report_events
-- ---------------------------------------------------------------------------

create table if not exists public.report_events (
  id bigint generated always as identity primary key,
  report_id text not null references public.reports (id) on delete cascade,
  kind text not null check (kind in ('forwarded', 'resolved')),

  -- Proof, for a closing event. Empty for a forwarding, which is a piece of
  -- paperwork rather than an observation.
  photos text[] not null default '{}',

  actor uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),

  -- A blockage that "was resolved" because somebody tapped a button is a claim,
  -- and it is the one claim nobody can check afterwards: the car has gone
  -- either way. So closing costs what opening did -- a photograph of the place,
  -- taken by somebody who is named.
  constraint report_events_resolution_needs_proof check (
    kind <> 'resolved' or coalesce(array_length(photos, 1), 0) > 0
  )
);

create index if not exists report_events_report_idx
  on public.report_events (report_id, created_at desc);

comment on table public.report_events is
  'Append-only. Something somebody did about a report.';

-- ---------------------------------------------------------------------------
-- What a correction is allowed to change
-- ---------------------------------------------------------------------------
--
-- A report is a claim about a place at a time. Editing where it happened, when
-- it happened or who saw it would not be a correction -- it would be a
-- different report wearing the first one's history, and the history is what
-- makes a filed complaint worth anything.
--
-- lib/supabase-data.ts sends only the four editable columns and `ReportUpdate`
-- is typed to permit only those, but a type is a promise this client makes.
-- This is the one that holds for any client.

create or replace function public.refuse_rewriting_a_report()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.latitude is distinct from old.latitude
    or new.longitude is distinct from old.longitude
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception
      'A report''s place, moment and author cannot be edited; file a new one'
      using errcode = 'integrity_constraint_violation';
  end if;

  return new;
end;
$$;

create trigger reports_are_corrected_not_rewritten
  before update on public.reports
  for each row execute function public.refuse_rewriting_a_report();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.reports enable row level security;
alter table public.report_events enable row level security;

-- A blocked pavement is a public fact and the map is the point of filing it.
create policy "Reports are readable by everybody"
  on public.reports for select
  to anon, authenticated
  using (true);

create policy "What was done about a report is readable by everybody"
  on public.report_events for select
  to anon, authenticated
  using (true);

create policy "A driver files a report as themselves"
  on public.reports for insert
  to authenticated
  with check (created_by = (select auth.uid()));

-- Only the author corrects it. What they may change is the trigger's business,
-- not this policy's.
create policy "An author corrects their own report"
  on public.reports for update
  to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy "An author withdraws their own report"
  on public.reports for delete
  to authenticated
  using (created_by = (select auth.uid()));

-- Anybody signed in may say a blockage is gone, and that is deliberate: the
-- person who goes back and looks is rarely the person who complained. What
-- stops this being a "resolved" button for vandals is the CHECK above -- you
-- have to produce a photograph of the clear kerb, under your own uuid.
create policy "Anybody acts on a report, under their own name"
  on public.report_events for insert
  to authenticated
  with check (actor = (select auth.uid()));

-- No update, no delete: what was done about a report is a record.

grant select on public.reports to anon, authenticated;
grant insert, update, delete on public.reports to authenticated;
grant select on public.report_events to anon, authenticated;
grant insert on public.report_events to authenticated;
