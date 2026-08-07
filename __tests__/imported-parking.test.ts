/**
 * Tests for how the two imported registries are joined.
 *
 * Worth pinning down because the failure is silent and expensive. CMPB and
 * OpenStreetMap both record the car park under Piața Operei, under different
 * names and a few metres apart, and OSM records two of CMPB's paid lots as
 * `fee=no`. Concatenated, the app drew "Gratuit" on top of a lot that charges 5
 * lei an hour -- a pin a driver acts on and gets a fine for.
 *
 * These run against the real bundled layers rather than fixtures, on purpose:
 * the thing being tested is a claim about that data, and a fixture would let
 * the claim stay true while the data drifted out from under it.
 */

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import { CMPB_PARKING } from "../constants/cmpb-parking.ts";
import { PUBLIC_PARKING } from "../constants/public-parking.ts";
import { distanceMeters } from "../lib/geo.ts";
import { registerTestLoader } from "./register-loader.ts";

let api: typeof import("../lib/api.ts");

before(async () => {
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  registerTestLoader();
  api = await import("../lib/api.ts");
});

/** The overlap threshold in lib/api.ts. */
const SAME_PLACE_M = 100;

const nearestCmpb = (spot: { latitude: number; longitude: number }) =>
  Math.min(
    ...CMPB_PARKING.map((lot) =>
      distanceMeters(spot.latitude, spot.longitude, lot.latitude, lot.longitude),
    ),
  );

describe("joining the CMPB and OpenStreetMap layers", () => {
  test("every CMPB lot survives: the operator is never dropped", async () => {
    const shown = new Set((await api.getSpots()).map((spot) => spot.id));

    const missing = CMPB_PARKING.filter((lot) => !shown.has(lot.id));
    assert.deepEqual(missing, []);
  });

  test("an OSM car park on top of a CMPB lot is dropped", async () => {
    const shown = new Set((await api.getSpots()).map((spot) => spot.id));

    const duplicated = PUBLIC_PARKING.filter(
      (spot) => nearestCmpb(spot) <= SAME_PLACE_M && shown.has(spot.id),
    );
    assert.deepEqual(
      duplicated.map((spot) => spot.title),
      [],
    );
  });

  test("an OSM car park CMPB does not operate is kept", async () => {
    const shown = new Set((await api.getSpots()).map((spot) => spot.id));

    const lost = PUBLIC_PARKING.filter(
      (spot) => nearestCmpb(spot) > SAME_PLACE_M && !shown.has(spot.id),
    );
    assert.deepEqual(lost, []);
  });

  /* The reason the whole rule exists. OSM has these two as `fee=no`, CMPB
     charges 5 lei an hour for both, and CMPB is the company taking the money.
     If either ever reappears, the app is telling drivers a paid lot is free. */
  test("the lots OSM wrongly calls free are gone", async () => {
    const shown = await api.getSpots();

    for (const title of ["Piața Gemeni", "Parcare SUUB"]) {
      const wrong = PUBLIC_PARKING.find((spot) => spot.title === title);
      assert.ok(wrong, `${title} is no longer in the OSM layer; update this test`);
      assert.equal(wrong.paid, false, `${title} is no longer the free-marked case`);
      assert.ok(
        !shown.some((spot) => spot.id === wrong.id),
        `${title} is drawn as free over a lot CMPB charges for`,
      );
    }
  });

  test("no two car parks share an id once the layers are joined", async () => {
    const shown = await api.getSpots();

    assert.equal(new Set(shown.map((spot) => spot.id)).size, shown.length);
  });

  /* Residents' parking is a bay a sector hall assigns to a household, not cheap
     public parking: a passing driver who takes one is ticketed or towed. Four
     of the fifteen in the box carry `access=permit` or `access=residents` and
     the Overpass query drops those; the other eight are untagged and are caught
     by name in `scripts/fetch-parking.mjs`. Asserted here rather than there
     because a script nobody re-runs cannot fail.

     These are also the spots the app means to get from their holders instead:
     a resident leaving for the day is exactly the park-sharing case, and that
     listing has to come from the person entitled to the bay. */
  test("residents-only parking is not offered to strangers", async () => {
    const shown = await api.getSpots();

    const residents = shown.filter((spot) =>
      /re[sșş]edin[țţt]|rezident|residential/i.test(spot.title),
    );
    assert.deepEqual(
      residents.map((spot) => spot.title),
      [],
    );
  });
});
