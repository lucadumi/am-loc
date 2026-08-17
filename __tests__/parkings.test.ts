/**
 * Tests for lib/parkings.ts.
 *
 * A parking is a private note about where somebody left the car, so the things
 * worth pinning down are the ones that would quietly corrupt that note: a
 * title that turns into the string "undefined" months later, a history that
 * comes back in the wrong order, and a delete that removes the wrong row.
 *
 * The whole suite runs on the no-backend path, which is the same code a fresh
 * clone runs. The remote half is a `client()` call away and belongs to a
 * Postgres, not to `node --test`.
 */

import assert from "node:assert/strict";
import { before, beforeEach, describe, test } from "node:test";

import { registerTestLoader } from "./register-loader.ts";
import type { Parking } from "../types/index.ts";

let parkings: typeof import("../lib/parkings.ts");
let fake: typeof import("./fake-async-storage.ts");

const PARKINGS_KEY = "amloc.parkings.v1";

before(async () => {
  // Same reasoning as the reports suite: lib/remote.ts reads these once, at
  // module load, so "no backend" has to be true before the first import.
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  registerTestLoader();
  parkings = await import("../lib/parkings.ts");
  fake = await import("./fake-async-storage.ts");
});

beforeEach(() => {
  fake.default.__store.delete(PARKINGS_KEY);
});

const spot = (over = {}) => ({ id: "cmpb_P0302", title: "Piața Amzei", ...over });

describe("what a parking is made of", () => {
  test("keeps the place and the moment", () => {
    const at = new Date("2026-08-16T09:30:00.000Z");
    const parking = parkings.parkingAt(spot(), at);
    assert.equal(parking.spotId, "cmpb_P0302");
    assert.equal(parking.spotTitle, "Piața Amzei");
    assert.equal(parking.at, "2026-08-16T09:30:00.000Z");
  });

  // Half the map is bundled and some of it has no title at all. An absent
  // field renders as "Loc fără nume"; the string "undefined" renders as a bug
  // somebody has to read in their own history.
  test("a place with no name leaves the title absent, not empty", () => {
    assert.equal(parkings.parkingAt(spot({ title: "" })).spotTitle, undefined);
    assert.equal(parkings.parkingAt(spot({ title: "   " })).spotTitle, undefined);
  });

  test("two parkings in the same millisecond are still two rows", () => {
    const at = new Date("2026-08-16T09:30:00.000Z");
    const one = parkings.parkingAt(spot(), at);
    const two = parkings.parkingAt(spot(), at);
    assert.notEqual(one.id, two.id);
  });
});

describe("the order", () => {
  const of = (at: string): Parking => ({ id: at, spotId: "s", at });

  test("newest first", () => {
    const list = [of("2026-08-01T10:00:00.000Z"), of("2026-08-09T10:00:00.000Z")];
    assert.deepEqual(
      [...list].sort(parkings.byNewest).map((p) => p.at),
      ["2026-08-09T10:00:00.000Z", "2026-08-01T10:00:00.000Z"],
    );
  });
});

describe("on a telephone with no project", () => {
  test("what was recorded comes back", async () => {
    await parkings.recordParking(spot());
    const list = await parkings.loadParkings();
    assert.equal(list.length, 1);
    assert.equal(list[0].spotId, "cmpb_P0302");
  });

  test("the newest is first, whatever order they were written in", async () => {
    await parkings.recordParking(spot({ id: "first" }));
    await new Promise((resolve) => setTimeout(resolve, 2));
    await parkings.recordParking(spot({ id: "second" }));

    const list = await parkings.loadParkings();
    assert.deepEqual(
      list.map((p) => p.spotId),
      ["second", "first"],
    );
  });

  test("the last one is the one the home screen asks for", async () => {
    await parkings.recordParking(spot({ id: "old" }));
    await new Promise((resolve) => setTimeout(resolve, 2));
    await parkings.recordParking(spot({ id: "new" }));

    assert.equal((await parkings.lastParking())?.spotId, "new");
  });

  test("nothing recorded means nothing to show, not a crash", async () => {
    assert.deepEqual(await parkings.loadParkings(), []);
    assert.equal(await parkings.lastParking(), undefined);
  });

  test("forgetting one removes that one and leaves the rest", async () => {
    const doomed = await parkings.recordParking(spot({ id: "doomed" }));
    await parkings.recordParking(spot({ id: "kept" }));

    await parkings.forgetParking(doomed.id);

    const list = await parkings.loadParkings();
    assert.deepEqual(
      list.map((p) => p.spotId),
      ["kept"],
    );
  });

  test("forgetting something that is not there changes nothing", async () => {
    await parkings.recordParking(spot());
    await parkings.forgetParking("p_nope");
    assert.equal((await parkings.loadParkings()).length, 1);
  });

  test("storage full of nonsense reads as an empty history", async () => {
    fake.default.__store.set(PARKINGS_KEY, "{not json");
    assert.deepEqual(await parkings.loadParkings(), []);
  });
});
