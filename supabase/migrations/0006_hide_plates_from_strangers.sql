-- Number plates are personal data, and were being served to everybody.
--
-- `0003` made every column of `reports` readable by `anon` and
-- `authenticated`, which is right for the shape of the complaint -- a blocked
-- pavement is a public fact and the map is the point of filing it -- and wrong
-- for one column. A registration number identifies a vehicle and through it a
-- keeper, and the `anon` key ships inside the app: anybody who has installed
-- AmLoc could read every plate anybody had ever reported.
--
-- WHO SHOULD SEE IT. Eventually, whoever is in a position to act on the report:
-- a sector hall, a warden, a moderator. None of those exist yet, and inventing
-- a role now would be guessing at a workflow nobody has designed. So this
-- narrows it to the one person who is certainly entitled to it today -- the
-- driver who typed it -- and leaves the wider grant to the migration that adds
-- the role.
--
-- HOW, given that row level security cannot mask a single column. The plate is
-- revoked on the table and the app reads through a view that decides per row.
-- The view is `security definer` (the default) precisely so that it can read a
-- column its callers cannot: that is what makes it the only way through. Row
-- visibility is unchanged, because there was never any to lose -- the select
-- policy on `reports` is `using (true)`.

create or replace view public.reports_readable as
select
  id,
  category,
  latitude,
  longitude,
  address,
  -- Null for everybody else, which the app already handles: `toBlockerReport`
  -- maps a null column to `undefined`, so a report simply reads as one with no
  -- plate on it rather than as a broken row.
  case when created_by = (select auth.uid()) then plate end as plate,
  note,
  photos,
  created_by,
  created_at
from public.reports;

comment on view public.reports_readable is
  'Reports as the app may read them: the plate is shown only to its author.';

-- The column, and only the column. Everything else about a report stays public,
-- and `insert`, `update` and `delete` are untouched -- an author still writes
-- and corrects their own plate, they simply cannot read anybody else's.
revoke select (plate) on public.reports from anon, authenticated;

grant select on public.reports_readable to anon, authenticated;
