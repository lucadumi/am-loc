/**
 * Tests for lib/spot-name.ts.
 *
 * Worth testing on its own because the rule is a regex over other people's
 * data, and the interesting cases are all false positives: Bucharest is full of
 * places whose names contain "parc" without being car parks. Getting those
 * wrong is invisible on 778 correct rows and embarrassing on the four that are
 * not.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { spokenSpot, spotName } from "../lib/spot-name.ts";
import type { ParkingSpot } from "../types/index.ts";

const named = (title: string) => spotName({ title });

describe("naming a car park a driver can recognise", () => {
  test("a bare place name is labelled", () => {
    // How CMPB records nearly every one of its lots.
    assert.equal(named("Academiei"), "Parcare Academiei");
    assert.equal(named("Lido"), "Parcare Lido");
    assert.equal(named("Ministerul Mediului"), "Parcare Ministerul Mediului");
  });

  test("a name that already says so is left alone", () => {
    assert.equal(named("Parcare supraetajată"), "Parcare supraetajată");
    assert.equal(named("Parcare subterană"), "Parcare subterană");
    assert.equal(
      named("A.D.P. SECTOR 2 PARCARE DE RESEDINTA"),
      "A.D.P. SECTOR 2 PARCARE DE RESEDINTA",
    );
  });

  test("the declined forms count as saying so", () => {
    assert.equal(named("Parcarea Mall"), "Parcarea Mall");
    assert.equal(named("Parcării Nord"), "Parcării Nord");
  });

  test("English names from OpenStreetMap count too", () => {
    assert.equal(named("Parking Center"), "Parking Center");
  });

  /* The whole reason the pattern stops at `parc[ăa]r`. These are real names
     from the two imports -- a street, a boyar's title, and two lots by a park
     -- and every one of them contains "parc" without being the word. Matched
     loosely, they would be the only four car parks in the city left unlabelled. */
  test("a place merely near a park is still labelled", () => {
    assert.equal(named("Parcului"), "Parcare Parcului");
    assert.equal(named("Parcalabul Baldovin"), "Parcare Parcalabul Baldovin");
    assert.equal(named("Gara Parc"), "Parcare Gara Parc");
    assert.equal(
      named("Mircea Voda Parc Timpuri Noi"),
      "Parcare Mircea Voda Parc Timpuri Noi",
    );
  });

  test("a name that is only whitespace does not become a dangling prefix", () => {
    assert.equal(named("   "), "Parcare");
    assert.equal(named(""), "Parcare");
  });

  test("surrounding whitespace is not carried into the label", () => {
    assert.equal(named("  Batistei  "), "Parcare Batistei");
  });
});

describe("a car park, said out loud", () => {
  const spot = (over: Partial<ParkingSpot> = {}): ParkingSpot => ({
    id: "s1",
    // As the registries actually store it: `fetch-cmpb-parking.mjs` title-cases
    // on the way in, so a reader is never handed a word in capitals.
    title: "Academiei",
    access: "public_facility",
    latitude: 44.43,
    longitude: 26.1,
    ...over,
  });

  test("the name comes first, and it is the displayed one", () => {
    // Not the stored one. A reader saying "ACADEMIEI" reads a registry key
    // aloud; `spotName` is what turns it into a place.
    assert.match(spokenSpot(spot()), /^Parcare Academiei/);
  });

  test("absences are silent rather than announced", () => {
    /* The reason this is not a template. Most imported car parks carry no
       rating, and a public one carries no status at all -- a sentence that
       always mentioned both would have a reader saying "fără notă, fără
       stare" about every result in the list. */
    const said = spokenSpot(spot());
    assert.ok(!said.includes("nota"));
    assert.ok(!said.includes("liber"));
    assert.ok(!said.includes("ocupat"));
  });

  test("everything known is said, in the order it is wanted", () => {
    const said = spokenSpot({
      ...spot({ area: "Sector 1", pricePerHour: 5, rating: 4.5 }),
      walkMin: 6,
    });
    assert.equal(
      said,
      "Parcare Academiei, Sector 1, 6 minute pe jos, 5 lei / oră, nota 4.5 din 5",
    );
  });

  test("a declared status is said in words, not as a colour", () => {
    // On screen this is a green or red dot, which is nothing to a reader.
    const free = spokenSpot(spot({ access: "private_property", status: "free" }));
    assert.ok(free.includes("liber"));
    const taken = spokenSpot(spot({ access: "private_property", status: "taken" }));
    assert.ok(taken.includes("ocupat"));
  });

  test("a free car park says so rather than saying nothing", () => {
    // `paid: false` is a known fact and not an absence; `formatPrice` is what
    // turns it into a word, and it has to reach the spoken form too.
    assert.ok(spokenSpot(spot({ paid: false })).includes("Gratuit"));
  });
});
