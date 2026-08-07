-- Spots, and the claims drivers make about them.
--
-- The two tables at the centre of the app, and the split between them is the
-- point: `spots` says a piece of ground exists, `status_reports` says somebody
-- looked at it. A spot therefore has no `status` column. Its status is the
-- current state of an argument about it, flattened back on by
-- `lib/supabase-rows.ts` and weighed by the belief model in `lib/spot-state.ts`.
--
-- Adding one would be the bug this schema exists to prevent: a single mutable
-- column that whoever wrote last owns, with no author, no timestamp and nothing
-- for the belief model to age.
--
-- The unions below are CHECK constraints over `text` rather than Postgres
-- enums. They mirror the TypeScript unions in `types/index.ts` and are meant to
-- be diffed against them by eye; a CHECK can also be widened inside an ordinary
-- transaction, which `alter type ... add value` cannot.

-- ---------------------------------------------------------------------------
-- spots
-- ---------------------------------------------------------------------------

create table if not exists public.spots (
  -- Text, not uuid. Ids are meaningful and stable across the seed layer and
  -- the imports: `s_universitate`, `g_unirii`, `osm_n12539222095`. An
  -- OpenStreetMap re-import has to land on the same row it did last time, and
  -- a generated key would make that a lookup by coordinates.
  id text primary key,
  title text not null check (length(btrim(title)) > 0),

  kind text not null default 'street' check (kind in ('street', 'garage')),

  -- Required, with no default, and that is deliberate. Every insert has to
  -- answer "who may speak for this?" out loud, because the default that gets
  -- forgotten is the one that lets a stranger mark somebody's garage occupied.
  -- See the note on `SpotAccess` in types/index.ts.
  access text not null check (access in ('public', 'private')),

  source text check (source in ('osm', 'cmpb', 'city', 'community', 'owner')),

  -- The one account allowed to open and close this spot's windows.
  owner_id uuid references auth.users (id) on delete set null,
  owner_name text,

  area text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),

  price_per_hour numeric(6, 2) check (price_per_hour >= 0),

  -- Whether the place charges at all, which is a different question from how
  -- much and the only one OpenStreetMap answers: `fee=yes` says a car park
  -- charges without saying the tariff. Three states on purpose -- charges, does
  -- not charge, and nobody has said -- so this is nullable rather than
  -- `not null default false`. Read as false, a hundred imported car parks
  -- would sort as free in `priceRank` and read "gratuit" on screen.
  paid boolean,

  total_count integer check (total_count >= 0),
  rating numeric(2, 1) check (rating between 0 and 5),
  image_url text,

  -- Null for anything imported or seeded: no user added those.
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  -- A private spot without an owner is unspeakable-for: no stranger may report
  -- on it and nobody is allowed to declare it, so it would be permanently
  -- taken. A public kerb with an owner is the opposite hazard, and the more
  -- serious one -- it is how somebody would claim a piece of public road.
  constraint spots_owner_matches_access check (
    (access = 'private') = (owner_id is not null)
  )
);

create index if not exists spots_location_idx on public.spots (latitude, longitude);
create index if not exists spots_owner_idx on public.spots (owner_id) where owner_id is not null;

comment on table public.spots is
  'A place a car can be left. Carries no status: see status_reports.';

-- ---------------------------------------------------------------------------
-- status_reports
-- ---------------------------------------------------------------------------

create table if not exists public.status_reports (
  id bigint generated always as identity primary key,
  spot_id text not null references public.spots (id) on delete cascade,
  status text not null check (status in ('free', 'leaving', 'taken')),

  -- Only meaningful for `leaving`, so it is refused on anything else rather
  -- than quietly ignored by the client that reads it.
  leaving_in_min integer check (leaving_in_min > 0 and leaving_in_min <= 240),

  -- Free spaces counted by the driver as they left. Null where not asked,
  -- which is not the same as zero.
  spaces integer check (spaces >= 0),

  reporter_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint status_reports_eta_only_when_leaving check (
    status = 'leaving' or leaving_in_min is null
  )
);

-- `recentReportRows` orders every recent claim by time; `fetchSpotById` takes
-- the newest fifty for one spot. One index each, because the second query
-- cannot use a plain `created_at` index without scanning other spots' rows.
create index if not exists status_reports_recent_idx
  on public.status_reports (created_at desc);
create index if not exists status_reports_spot_recent_idx
  on public.status_reports (spot_id, created_at desc);

comment on table public.status_reports is
  'Append-only. One driver''s claim about one public spot, at one moment.';

-- ---------------------------------------------------------------------------
-- A stranger may not report on a private spot. Not "with low weight": may not.
-- ---------------------------------------------------------------------------
--
-- Enforced as a trigger rather than only in the insert policy, on purpose.
-- This is the rule the whole public/private split rests on (see the header of
-- lib/private-spots.ts), and a policy is skipped by `service_role` and by
-- anything run from the dashboard. A trigger holds against every one of those.
--
-- lib/spot-reports.ts refuses the same thing client-side. Two copies, because
-- the client's gives a decent error in Romanian and this one is the one that
-- actually holds.

create or replace function public.refuse_reports_on_private_spots()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  spot_access text;
begin
  select access into spot_access from public.spots where id = new.spot_id;

  if spot_access is null then
    raise exception 'No such spot: %', new.spot_id
      using errcode = 'foreign_key_violation';
  end if;

  if spot_access <> 'public' then
    raise exception
      'A private spot is described by its owner, not reported on by anybody else'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger status_reports_public_spots_only
  before insert or update on public.status_reports
  for each row execute function public.refuse_reports_on_private_spots();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.spots enable row level security;
alter table public.status_reports enable row level security;

-- Readable by `anon` too, not just `authenticated`. The map loads before
-- anybody signs in -- `fetchSpots` never asks for a session -- and a map that
-- needs an account to show a car park is a map nobody opens twice.
create policy "Spots are readable by everybody"
  on public.spots for select
  to anon, authenticated
  using (true);

create policy "Claims are readable by everybody"
  on public.status_reports for select
  to anon, authenticated
  using (true);

-- You may add a public kerb as yourself, or list a private spot you own.
-- `owner_id` is checked against the caller so that listing cannot be done on
-- somebody else's behalf; the CHECK above already ties it to `access`.
create policy "A driver adds a spot as themselves"
  on public.spots for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and (owner_id is null or owner_id = (select auth.uid()))
  );

-- Correcting a spot is for whoever owns it, or failing that whoever added it.
-- The `with check` repeats the `using` clause so an update cannot hand the row
-- to somebody else on its way out.
create policy "An owner corrects their own spot"
  on public.spots for update
  to authenticated
  using (
    owner_id = (select auth.uid())
    or (owner_id is null and created_by = (select auth.uid()))
  )
  with check (
    (owner_id is null or owner_id = (select auth.uid()))
    and created_by = created_by
  );

create policy "An owner removes their own spot"
  on public.spots for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    or (owner_id is null and created_by = (select auth.uid()))
  );

-- A claim is filed as the caller and never on anybody else's behalf. The
-- server writing `auth.uid()` is what makes reputation mean anything at all;
-- lib/supabase-data.ts deliberately passes no reporter id of its own.
create policy "A driver files a claim as themselves"
  on public.status_reports for insert
  to authenticated
  with check (reporter_id = (select auth.uid()));

-- No update and no delete policy, for anybody, deliberately. The table is a
-- record of what was said and when. A driver who was wrong files a newer claim
-- and lets the belief model outweigh the old one -- which is what makes a spot
-- read as contested instead of flipping to whoever spoke last.

grant select on public.spots to anon, authenticated;
grant insert, update, delete on public.spots to authenticated;
grant select on public.status_reports to anon, authenticated;
grant insert on public.status_reports to authenticated;
