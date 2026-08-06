/**
 * Tests for the order the home screen puts kerbs in.
 *
 * The screen answers one question — what can I park in, from where I am
 * standing — and the answer is an ordering. Getting it wrong is not a crash; it
 * is a driver walking past a free space to reach a paid one, which they would
 * never notice and never forgive.
 */

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import { registerTestLoader } from "./register-loader.ts";
import type { ParkingSpot } from "../types/index.ts";

let api: typeof import("../lib/api.ts");

before(async () => {
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  registerTestLoader();
  api = await import("../lib/api.ts");
});

/** Piața Universității, as the driver's position. */
const ME = { latitude: 44.4353, longitude: 26.1028 };

const M_PER_DEG_LAT = 111_320;

/** A spot `metres` due north of the driver, so distances read as written. */
const at = (id: string, metres: number, over: Partial<ParkingSpot> = {}): ParkingSpot => ({
  id,
  title: id,
  access: "public",
  status: "taken",
  latitude: ME.latitude + metres / M_PER_DEG_LAT,
  longitude: ME.longitude,
  updatedAt: "2026-08-06T10:00:00.000Z",
  ...over,
});

describe("priceRank", () => {
  test("known free beats a known price beats nothing known", () => {
    const free = api.priceRank({ paid: false, pricePerHour: undefined });
    const cheap = api.priceRank({ pricePerHour: 3, paid: true });
    const unknown = api.priceRank({ pricePerHour: undefined, paid: undefined });

    assert.ok(free < cheap);
    assert.ok(cheap < unknown);
  });

  test("an unpriced spot is last, not free", () => {
    /* The whole reason this is a function. Reading `pricePerHour` undefined as
       zero would, in Bucharest, mean calling the blue zone free. */
    assert.equal(api.priceRank({ pricePerHour: undefined, paid: undefined }), Infinity);
    assert.equal(api.priceRank({ pricePerHour: 0, paid: undefined }), 0);
  });
});

describe("rankNearby", () => {
  test("nearest first", () => {
    const order = api
      .rankNearby([at("far", 900), at("near", 100), at("middle", 400)], ME)
      .map((s) => s.id);

    assert.deepEqual(order, ["near", "middle", "far"]);
  });

  test("among equal walks, the cheaper one wins", () => {
    /* Walk time rather than metres is what groups them, and that is the point:
       two kerbs ninety metres apart are the same walk, so price gets to decide.
       Sorting on raw distance would let a difference nobody can feel bury a
       space that costs nothing. */
    const order = api
      .rankNearby(
        [
          at("paid", 100, { pricePerHour: 6, paid: true }),
          at("free", 120, { paid: false }),
          at("unpriced", 110),
        ],
        ME,
      )
      .map((s) => s.id);

    assert.deepEqual(order.slice(0, 2), ["free", "paid"]);
    assert.equal(order[2], "unpriced", "nothing known about the price sorts last");
  });

  test("distance still breaks a tie on price", () => {
    const order = api
      .rankNearby([at("b", 120, { paid: false }), at("a", 90, { paid: false })], ME)
      .map((s) => s.id);

    assert.deepEqual(order, ["a", "b"]);
  });

  test("anything past the radius is not on the list", () => {
    const spots = [at("here", 200), at("across-town", 4000)];
    assert.deepEqual(
      api.rankNearby(spots, ME).map((s) => s.id),
      ["here"],
    );
  });

  test("nothing is dropped for being unreported", () => {
    /* The bug this replaced. The search screen filters on whether a spot can be
       promised free, and the hundred car parks imported from OpenStreetMap
       carry no observation at all — so that filter returned zero results beside
       every destination in the city. */
    const unreported = [at("osm1", 100, { source: "osm" }), at("osm2", 200, { source: "osm" })];
    assert.equal(api.rankNearby(unreported, ME).length, 2);
  });

  test("the list is capped", () => {
    const many = Array.from({ length: 40 }, (_, i) => at(`s${i}`, 50 + i * 10));
    assert.equal(api.rankNearby(many, ME).length, 20);
    assert.equal(api.rankNearby(many, ME, { limit: 5 }).length, 5);
  });

  test("it carries the walk, because that is what the row shows", () => {
    const [only] = api.rankNearby([at("s", 400)], ME);
    assert.ok(only.walkMin >= 1);
    assert.ok(Math.abs(only.distance - 400) < 5);
  });
});

describe("the real map, from a real place", () => {
  test("a driver at Universitate is offered actual car parks", async () => {
    /* The end-to-end version of the failure: the app knew about a dozen real
       car parks within walking distance of every major destination and showed
       the driver none of them. */
    const spots = await api.getSpots();
    const near = api.rankNearby(spots, ME, { radiusM: 1500 });

    assert.ok(near.length >= 5, `only ${near.length} within 1.5 km of Universitate`);
    assert.ok(
      near.some((s) => s.source === "osm"),
      "the imported car parks have to be reachable from here",
    );
    assert.ok(
      near.every((s, i) => i === 0 || near[i - 1].walkMin <= s.walkMin),
      "and they have to come out in walking order",
    );
  });
});
