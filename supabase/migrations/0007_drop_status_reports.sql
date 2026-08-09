-- The app no longer holds an opinion about whether a public space is free.
--
-- `status_reports` was the table strangers filed claims into, and `believe()`
-- in the client was the machinery that weighed those claims against each other:
-- half-lives per status, corroboration, contested votes, decay. All of it is
-- gone from the app, and leaving the table behind would leave a schema that
-- describes a feature the product does not have.
--
-- WHY THE MODEL WENT RATHER THAN BEING SWITCHED OFF. Arbitrating between
-- strangers needs two things, and neither held here. It needs them to be
-- filing something -- nobody was ever asked, because the app shipped without a
-- reporting screen. And it needs their claims to be checkable by the next
-- person to arrive, which is true of one kerb space and false of a four-hundred
-- bay garage: "e plin" costs its author nothing, deters everybody else, and can
-- be contradicted by nobody.
--
-- Occupancy will come from a ledger instead -- an operator's barrier, or a
-- private owner's own `availability_windows`. A ledger does not contradict
-- itself, so none of the arbitration below would ever have run against it. This
-- is not a feature deferred; it is the wrong instrument, removed.
--
-- WHAT IS LEFT IN ITS PLACE. Nothing, and that is deliberate. A public spot now
-- carries where it is, how many bays it has and what it charges -- all of which
-- CMPB and OpenStreetMap actually publish -- and says nothing about whether
-- there is room in it. The map draws those grey and hollow rather than in a
-- status colour, which is the true statement: 838 of the 851 imported car parks
-- never had an observation behind them.
--
-- The private half is untouched. `availability_windows` is a different species
-- of fact -- a decision by the one person entitled to make it, not a claim by a
-- passer-by -- and it is where the app's only exact answers now come from. See
-- the header of 0002.
--
-- THE TRIGGER AND THE PUBLICATION go with the table: the trigger only ever
-- guarded inserts into it, and a publication entry for a dropped table would
-- fail the next time realtime reconnected.

alter publication supabase_realtime drop table public.status_reports;

drop trigger if exists status_reports_public_spots_only on public.status_reports;

drop table if exists public.status_reports;

-- `refuse_reports_on_private_spots` is dropped with its last user. The rule it
-- enforced -- that a stranger may not speak for somebody else's space -- did not
-- go away; it is now structural, because there is no table in which a stranger
-- can say anything about any space at all.
drop function if exists public.refuse_reports_on_private_spots();
