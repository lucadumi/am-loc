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

import { formatPrice } from "./geo.ts";
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

/**
 * A car park, as one sentence, for a screen reader.
 *
 * A reader landing on a card reads six unrelated fragments otherwise --
 * the name, a price, an area, a walk time, a rating -- with nothing saying
 * they describe the same car park, and in an order decided by the layout
 * rather than by what matters. Said as a sentence instead, cheapest fact
 * first, and only what is actually known: a public car park carries no status
 * and most carry no rating, so a template that always mentioned both would
 * announce absences.
 */
export function spokenSpot(spot: ParkingSpot & { walkMin?: number }): string {
  const parts = [spotName(spot)];
  if (spot.area) parts.push(spot.area);
  if (spot.walkMin !== undefined) parts.push(`${spot.walkMin} minute pe jos`);
  parts.push(formatPrice(spot.pricePerHour, spot.paid));
  if (spot.status) {
    parts.push(spot.status === "free" ? "liber" : "ocupat");
  }
  if (spot.rating !== undefined) parts.push(`nota ${spot.rating} din 5`);
  return parts.join(", ");
}
