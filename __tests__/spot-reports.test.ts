/**
 * Tests for lib/spot-reports.ts and the belief it now feeds.
 *
 * The point of this file is the last suite: before reports were stored as
 * rows, a spot could never be contested, because the app only ever produced
 * one report for it. These check that a second driver can now genuinely
 * disagree with the first, and that the model resolves it.
 */

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import { registerTestLoader } from "./register-loader.ts";

let reports: typeof import("../lib/spot-reports.ts");
let belief: typeof import("../lib/spot-belief.ts");

const NOW = new Date("2026-08-03T12:00:00.000Z");
const agoMin = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

const spot = (over = {}) => ({
  id: "s1",
  title: "Strada Lipscani",
  access: "public" as const,
  status: "free" as const,
  latitude: 44.43,
  longitude: 26.1,
  updatedAt: agoMin(2),
  reportedBy: "ana",
  ...over,
});

before(async () => {
  registerTestLoader();
  reports = await import("../lib/spot-reports.ts");
  belief = await import("../lib/spot-belief.ts");
});

describe("storing status reports", () => {
  test("starts empty and keeps what is filed, newest first", async () => {
    await reports.clearStatusReports();
    assert.deepEqual(await reports.loadReports(), []);

    await reports.addStatusReport({ spot: { id: "s1", access: "public" }, status: "free" });
    await reports.addStatusReport({ spot: { id: "s1", access: "public" }, status: "taken" });

    const stored = await reports.loadReports();
    assert.equal(stored.length, 2);
    assert.equal(stored[0].status, "taken");
    assert.equal(stored[0].reporterId, reports.LOCAL_REPORTER_ID);
    assert.ok(stored[0].at, "a report should be timestamped");
  });

  test("groups by spot", async () => {
    await reports.clearStatusReports();
    await reports.addStatusReport({ spot: { id: "a", access: "public" }, status: "free" });
    await reports.addStatusReport({ spot: { id: "b", access: "public" }, status: "taken" });
    await reports.addStatusReport({ spot: { id: "a", access: "public" }, status: "taken" });

    const grouped = reports.groupBySpot(await reports.loadReports());
    assert.equal(grouped.get("a")?.length, 2);
    assert.equal(grouped.get("b")?.length, 1);
    assert.equal(grouped.get("nope"), undefined);
  });

  test("reads a spot's own fields back as its first report", () => {
    const seed = reports.seedReport(spot());
    assert.equal(seed.reporterId, "ana");
    assert.equal(seed.status, "free");
    assert.equal(seed.at, agoMin(2));
  });
});

describe("a spot can now be contested", () => {
  test("one report is unanimous, as it must be", () => {
    const only = belief.withBelief(spot(), NOW);
    assert.equal(only.belief.contested, false);
    assert.equal(only.belief.margin, 1);
    assert.equal(only.belief.considered, 1);
  });

  test("a contradicting report makes it contested", () => {
    // The case the model exists for: two people, one kerb, different answers.
    const disputed = belief.withBelief(spot(), NOW, [
      { spotId: "s1", status: "taken", at: agoMin(2), reporterId: "me" },
    ]);
    assert.equal(disputed.belief.considered, 2);
    assert.equal(disputed.belief.contested, true);
    assert.ok(disputed.belief.margin < 1);
    assert.equal(disputed.confidenceLevel, "disputed");
  });

  test("an agreeing report raises confidence instead", () => {
    const alone = belief.withBelief(spot(), NOW);
    const seconded = belief.withBelief(spot(), NOW, [
      { spotId: "s1", status: "free", at: agoMin(1), reporterId: "me" },
    ]);
    assert.equal(seconded.belief.contested, false);
    assert.ok(seconded.belief.confidence > alone.belief.confidence);
  });

  test("a newer report outweighs the seed without deleting it", () => {
    const flipped = belief.withBelief(spot({ updatedAt: agoMin(25) }), NOW, [
      { spotId: "s1", status: "taken", at: agoMin(0), reporterId: "me" },
    ]);
    assert.equal(flipped.belief.status, "taken", "the fresh claim wins");
    assert.equal(flipped.belief.considered, 2, "the old one is still counted");
  });

  test("believeAll reads filed reports off storage", async () => {
    await reports.clearStatusReports();
    await reports.addStatusReport({ spot: { id: "s1", access: "public" }, status: "taken" });

    const [only] = await belief.believeAll([spot()], NOW);
    assert.equal(only.belief.considered, 2);
    assert.equal(only.belief.contested, true);
  });

  test("an older contradiction does not flip a fresher claim", () => {
    /* Recency decides, rather than the reporter's record. With no way to earn
       a record, weighing by one would be weighing by a constant -- and a
       constant below the confidence threshold makes every spot in the city
       read "Neconfirmat". */
    const result = belief.withBelief(spot(), NOW, [
      { spotId: "s1", status: "taken", at: agoMin(60), reporterId: "me" },
    ]);
    assert.equal(result.belief.status, "free");
  });
});
