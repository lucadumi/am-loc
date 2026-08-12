-- Three kinds of parking place, because the law treats them as three.
--
-- `0001` stored one bit: `public` or `private`, meaning roughly "somebody owns
-- it or nobody does". That was enough while the only question was who may say
-- whether a space is free. It stopped being enough the moment money entered
-- the design, and the reason is legal rather than architectural.
--
-- WHAT THE TWO VALUES COULD NOT SAY. A marked space on a public street that a
-- resident holds a permit for is neither. CMPB and the sector halls allocate
-- thousands of them, and the permit is a right to *park*, granted to a person
-- -- not ownership of the asphalt, and not a right to sell or sublet what the
-- city allocated. Under the old column such a space had to be labelled one of
-- two things and both were false:
--
--   `public`, and its holder cannot be told apart from a stranger, so the one
--   person entitled to speak for it is the one person the schema ignores.
--
--   `private`, and it enters every flow built for property -- reservations,
--   and eventually payment -- which is selling a piece of public road. That is
--   a contravention of 500-2.500 lei, and obstructing a public road reaches
--   art. 339 Cod Penal. It is the rock MonkeyParking ran onto in San
--   Francisco, and Romanian law is if anything plainer about it.
--
-- The second is the one this migration exists to make impossible, and the
-- issue's `Done when` says so: no public or permit-based spot may accidentally
-- enter the paid private flow.
--
-- WHERE THE CAPABILITIES LIVE. Not here. There is deliberately no
-- `paid_sharing_allowed` column, because a column is a thing somebody can set;
-- what may be done with a place is computed from what the place *is*, by
-- `rightsOf` in lib/spot-rights.ts, and the only thing stored is the kind. The
-- database's job is to make the kind true and to refuse the two acts that are
-- unlawful for the wrong one -- offering it, and owning it.

-- ---------------------------------------------------------------------------
-- The column
-- ---------------------------------------------------------------------------
--
-- Widened, rewritten and narrowed again, in that order, because the old check
-- forbids the new values and the new check forbids the old ones: there is no
-- moment at which both sets are legal unless the constraint is off.

alter table public.spots drop constraint if exists spots_access_check;
alter table public.spots drop constraint if exists spots_owner_matches_access;

update public.spots set access = 'private_property' where access = 'private';
update public.spots set access = 'public_facility'  where access = 'public';

-- Anything else was already invalid under the old check and cannot exist. Said
-- out loud rather than assumed, because this is the statement that decides
-- whether the constraint below can be added at all, and failing here with a
-- clear message beats failing on a constraint violation naming a row number.
do $$
declare
  odd integer;
begin
  select count(*) into odd from public.spots
  where access is not null
    and access not in ('public_facility', 'private_property', 'residential_permit');

  if odd > 0 then
    raise exception '% spot(s) carry an access value 0010 does not know', odd;
  end if;
end
$$;

alter table public.spots
  add constraint spots_access_check
  check (access in ('public_facility', 'private_property', 'residential_permit'));

-- Every constraint here is dropped before it is added, so the file can be run
-- again against a project that already has it. `alter table ... add constraint`
-- has no `if not exists`, and a migration that fails halfway through on its
-- second run is one somebody has to unpick by hand.

comment on column public.spots.access is
  'What kind of place this is. Capabilities are derived from it: see lib/spot-rights.ts.';

-- ---------------------------------------------------------------------------
-- Who may own what
-- ---------------------------------------------------------------------------
--
-- The old constraint was an equivalence -- `(access = 'private') = (owner_id is
-- not null)` -- and it has to become two separate rules, because the three
-- kinds no longer split evenly.
--
-- A `private_property` space must have an owner: without one it is
-- unspeakable-for, permanently taken and offerable by nobody.
--
-- A `public_facility` must not. That is the more serious direction: an owner
-- on a public kerb is how somebody claims a piece of public road, and every
-- capability that follows from ownership would follow from it.
--
-- A `residential_permit` may have one, and this is the whole reason the
-- equivalence had to be broken. The permit holder is recorded so the app knows
-- whose space it is -- but recording them grants nothing here, because what
-- may be done with the place comes from its kind and not from its having
-- somebody attached. That is the difference between this schema and one where
-- `owner_id is not null` was quietly the permission.

alter table public.spots drop constraint if exists spots_property_has_an_owner;
alter table public.spots
  add constraint spots_property_has_an_owner
  check (access <> 'private_property' or owner_id is not null);

alter table public.spots drop constraint if exists spots_public_road_has_no_owner;
alter table public.spots
  add constraint spots_public_road_has_no_owner
  check (access <> 'public_facility' or owner_id is null);

-- ---------------------------------------------------------------------------
-- What may be offered
-- ---------------------------------------------------------------------------
--
-- `0002` refuses a window on anything whose access is not `private`. The value
-- it compares against no longer exists, so left alone this trigger would
-- refuse *every* window including the ones it was written to allow -- the kind
-- of breakage that looks like a product decision rather than a bug.
--
-- Rewritten to name the one kind money may be asked for, which is also the one
-- kind that may be offered at all. A permit space is refused here as firmly as
-- a public one, and the message says which of the two it is: "not yours to
-- give" is true of a public kerb and merely confusing to a resident who does
-- hold a permit for the space they are looking at.

create or replace function public.refuse_windows_on_spots_you_do_not_own()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  spot record;
begin
  select access, owner_id into spot from public.spots where id = new.spot_id;

  if spot is null then
    raise exception 'No such spot: %', new.spot_id
      using errcode = 'foreign_key_violation';
  end if;

  if spot.access = 'residential_permit' then
    raise exception
      'A residential permit is a right to park, not a space you may hand on'
      using errcode = 'insufficient_privilege';
  end if;

  if spot.access <> 'private_property' then
    raise exception 'A public space cannot be offered: it is not yours to give'
      using errcode = 'insufficient_privilege';
  end if;

  if spot.owner_id is distinct from new.owner_id then
    raise exception 'Only the owner of a spot may offer it'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- The trigger itself is unchanged and is not re-created: `create or replace
-- function` swaps the body under it, and dropping the trigger to add it back
-- would leave a window in which windows could be written unchecked.
