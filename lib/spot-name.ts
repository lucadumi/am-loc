/**
 * What to call a car park on screen.
 *
 * The registries name their places, not their function. CMPB records the spot
 * on Strada Academiei as `ACADEMIEI`, and OpenStreetMap records a garage as
 * `Fabrica de Pâine`, because in both files every row is already known to be
 * parking. Lifted onto a screen, that context is gone: a card reading
 * "Academiei" over a photograph is a street, a building or a bus stop, and the
 * one thing a driver cannot tell is that it is somewhere to leave the car.
 *
 * 778 of the 865 imported car parks are bare names like this.
 *
 * WHY THIS IS A DISPLAY FUNCTION AND NOT A COLUMN. The stored title is what the
 * registry calls the place, and it has to stay that way for two reasons. It is
 * what a driver types into the search box -- they look for "Academiei", not for
 * "Parcare Academiei" -- and it is what a re-import compares against, so
 * rewriting it would make every row look changed on the next run of
 * `scripts/import-parking.mjs`. Presentation belongs at the point of
 * presentation.
 */

import type { ParkingSpot } from "@/types";

/**
 * Names that already say what they are.
 *
 * A stem rather than the whole word, so the declined forms Romanian actually
 * uses are caught: `parcare`, `parcarea`, `parcări`, `parcării`. `parking` is
 * here because OpenStreetMap carries a few English names.
 *
 * The stem stops at `parc[ăa]r` on purpose, and the boundary is doing real
 * work. Bucharest has streets called `Parcului` and `Parcalabul Baldovin`, and
 * CMPB has lots named `Gara Parc` and `Mircea Voda Parc Timpuri Noi` -- all of
 * which contain "parc" and none of which is the word "parking place". Matching
 * "parc" alone would leave those four unlabelled while labelling everything
 * else, which is the one outcome worse than labelling none of them.
 */
const ALREADY_SAYS_SO = /parc[ăa]r|parking/i;

/**
 * A car park's name as a driver should read it.
 *
 * Prefixed with "Parcare" unless the name already says as much, so
 * `ACADEMIEI` reads "Parcare Academiei" while `Parcare supraetajată` and
 * `A.D.P. SECTOR 2 PARCARE DE RESEDINTA` are left exactly as they are.
 */
export function spotName(spot: Pick<ParkingSpot, "title">): string {
  const title = spot.title.trim();
  if (!title) return "Parcare";
  return ALREADY_SAYS_SO.test(title) ? title : `Parcare ${title}`;
}
