/**
 * Whether a blocker report has a place worth filing on.
 *
 * A report is a claim that something is wrong at a particular spot, and the
 * spot is the only part of it nobody can reconstruct later: the car will have
 * gone. Get it wrong and the report is not merely useless, it is misleading --
 * somebody walks to a street where nothing is happening, and the real blockage
 * is never seen.
 *
 * WHAT THIS REPLACED. The screen used to file at `location ?? BUCHAREST`, on
 * the reasoning that a report should never be lost. That reasoning is right
 * about reports and wrong about places: a complaint pinned to Piața
 * Universității because the fix had not landed is a complaint about Piața
 * Universității.
 *
 * `CurrentLocation` already grades its own answer, and its own doc says the
 * three sources are "metres, kilometres and nothing". Only the first is precise
 * enough to send anybody to an address. So a GPS fix files on its own; anything
 * less has to be confirmed by the driver placing the pin themselves, which is
 * always available and takes one tap.
 *
 * NOBODY IS BLOCKED. That is the point of the second clause. A driver in an
 * underground car park, or with location switched off entirely, can still file
 * -- they just have to say where, rather than have the app guess and be wrong
 * in their name.
 *
 * Pure, with no imports, so `node --test` loads it.
 */

/** How the app came by a position. Mirrors `CurrentLocation["source"]`. */
export type PlaceSource = "gps" | "ip" | "fallback";

export interface PlaceCheck {
  /** True when the driver has dragged or tapped the pin themselves. */
  placed: boolean;
  /** How the device's own fix was obtained, if there is one at all. */
  source?: PlaceSource;
  /**
   * True when correcting a report that already exists.
   *
   * Its coordinates were vouched for when it was filed and are deliberately
   * not re-stamped: an edit changes what the driver typed, never where the
   * blockage was. See the trigger in `supabase/migrations/0003_blocker_reports.sql`,
   * which refuses to let them move at all.
   */
  editing?: boolean;
}

/** Whether this report may be filed, given what is known about where it is. */
export function mayFileAt({ placed, source, editing }: PlaceCheck): boolean {
  if (editing) return true;
  if (placed) return true;
  return source === "gps";
}
