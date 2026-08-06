/**
 * Tests for lib/spot-state.ts.
 *
 * Pure functions and an injected clock, so none of this needs a device, a
 * network, or a real minute to pass. Run with:
 *
 *     npm test
 *
 * Node strips the types itself, so there is no test framework and no build
 * step to keep in sync with the app's.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  HALF_LIVES,
  believe,
  describeConfidence,
  freshness,
  leavingWindow,
  minutesBetween,
  type SpotReport,
} from "../lib/spot-state.ts";

const NOW = new Date("2026-08-02T12:00:00.000Z");
const agoMin = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();


const report = (over: Partial<SpotReport> = {}): SpotReport => ({
  spotId: "s1",
  status: "free",
  at: agoMin(0),
  reporterId: "r1",
  ...over,
});

describe("freshness", () => {
  test("a brand new report is worth its full weight", () => {
    assert.equal(freshness("free", 0), 1);
  });

  test("halves at the half-life, quarters at twice it", () => {
    assert.equal(freshness("free", HALF_LIVES.free), 0.5);
    assert.equal(freshness("free", HALF_LIVES.free * 2), 0.25);
  });

  test("free rots faster than taken", () => {
    // The asymmetry the whole model rests on: a free spot is gone in minutes
    // because everyone is hunting it, while a taken one stays taken for as
    // long as the errand lasts.
    const after = 10;
    assert.ok(
      freshness("free", after) < freshness("taken", after),
      "a ten minute old 'free' should be worth less than a ten minute old 'taken'"
    );
  });

  test("never reaches zero", () => {
    // Linear decay would hit exactly zero at an arbitrary moment and imply
    // certainty in the other direction.
    assert.ok(freshness("free", 600) > 0);
  });
});

describe("minutesBetween", () => {
  test("measures elapsed minutes", () => {
    assert.equal(minutesBetween(agoMin(7), NOW), 7);
  });

  test("a clock skewed forward cannot make a report fresher than new", () => {
    const future = new Date(NOW.getTime() + 60_000).toISOString();
    assert.equal(minutesBetween(future, NOW), 0);
  });
});

describe("believe", () => {
  test("no reports means no belief", () => {
    const belief = believe([], NOW);
    assert.equal(belief.source, null);
    assert.equal(belief.confidence, 0);
    assert.equal(belief.stale, true);
    assert.equal(belief.corroboration, 0);
  });

  test("one fresh first-hand report is believed", () => {
    /* A report here is first-hand: somebody who was on that kerb and said what
       they saw. A single fresh one is worth acting on. */
    const belief = believe([report({ at: agoMin(0) })], NOW);
    assert.equal(belief.status, "free");
    assert.equal(belief.confidence, 1);
    assert.equal(belief.stale, false);
    assert.equal(belief.contested, false);
  });

  test("nothing is permanently unconfirmed", () => {
    /* The trap this model is designed around. Weigh a report by `trust x
       freshness` and every reporter sits at the same opening prior, which lands
       below any sensible threshold — so every spot in the city reads
       "Neconfirmat", including one reported five seconds ago.

       Corroboration with an "unbacked" badge would do the same thing by another
       route: almost every spot has exactly one report, so almost every spot
       would carry it for ever. Hence no such badge. One driver who was there is
       not a rumour. */
    const one = believe([report({ at: agoMin(0) })], NOW);
    assert.equal(describeConfidence(one), "fresh");
    assert.equal(one.corroboration, 1);
  });

  test("the same report goes stale with age", () => {
    const fresh = believe([report({ at: agoMin(0) })], NOW);
    const old = believe([report({ at: agoMin(20) })], NOW);
    assert.ok(old.confidence < fresh.confidence);
    assert.equal(old.stale, true, `20 minutes on a 4 minute half-life, got ${old.confidence}`);
  });

  test("disagreement is resolved by freshness and flagged as contested", () => {
    const belief = believe(
      [
        report({ status: "taken", at: agoMin(1), reporterId: "a" }),
        report({ status: "free", at: agoMin(9), reporterId: "b" }),
      ],
      NOW
    );
    assert.equal(belief.status, "taken", "the more recent voice should win");
    assert.equal(belief.contested, true);
    assert.ok(belief.margin > 0.5 && belief.margin < 1);
    assert.equal(belief.considered, 2);
  });

  test("agreement between two people beats either alone", () => {
    /* Corroboration is what replaced reputation, and it is the better measure:
       it needs nobody to have a history and cannot be gamed by being early. */
    const one = believe([report({ at: agoMin(6), reporterId: "a" })], NOW);
    const both = believe(
      [
        report({ at: agoMin(6), reporterId: "a" }),
        report({ at: agoMin(6), reporterId: "b" }),
      ],
      NOW
    );
    assert.ok(both.confidence > one.confidence);
    assert.equal(both.corroboration, 2);
    assert.equal(both.contested, false, "two reports saying the same thing do not conflict");
  });

  test("voices that have decayed away corroborate nothing", () => {
    /* Otherwise a kerb looks well-attested on the strength of people who looked
       at it last week. An hour still counts for something on a four minute
       half-life -- barely -- but three days has decayed past the point floating
       point can tell it from zero, which is the same line `source` is drawn on. */
    const belief = believe(
      [
        report({ at: agoMin(0), reporterId: "a" }),
        report({ at: agoMin(60 * 24 * 3), reporterId: "b" }),
      ],
      NOW
    );
    assert.equal(belief.corroboration, 1);
  });

  test("attributes the belief to a report that actually voted for the winner", () => {
    const belief = believe(
      [
        report({ status: "taken", at: agoMin(1), reporterId: "a" }),
        report({ status: "free", at: agoMin(9), reporterId: "b" }),
      ],
      NOW
    );
    assert.equal(belief.source?.status, belief.status);
  });

  test("carries the count the last person there gave", () => {
    const belief = believe([report({ at: agoMin(0), spaces: 4 })], NOW);
    assert.equal(belief.source?.spaces, 4);
  });
});

describe("leaving reports", () => {
  test("a promise to leave is not yet a free spot", () => {
    const belief = believe(
      [report({ status: "leaving", leavingInMin: 5, at: agoMin(0) })],
      NOW
    );
    assert.equal(belief.status, "leaving");
  });

  test("counts down and comes due", () => {
    const soon = leavingWindow(
      report({ status: "leaving", leavingInMin: 5, at: agoMin(1) }),
      NOW
    );
    assert.equal(soon.due, false);
    assert.equal(soon.minutesUntil, 4);

    const due = leavingWindow(
      report({ status: "leaving", leavingInMin: 5, at: agoMin(6) }),
      NOW
    );
    assert.equal(due.due, true);
  });

  test("an overdue promise stops counting rather than lingering forever", () => {
    const stale = report({ status: "leaving", leavingInMin: 5, at: agoMin(40) });
    assert.equal(leavingWindow(stale, NOW).overdue, true);

    const belief = believe([stale], NOW);
    assert.equal(belief.source, null, "nothing should be left to believe");
  });
});

describe("describeConfidence", () => {

  test("names the states the UI needs to draw differently", () => {
    assert.equal(describeConfidence(believe([], NOW)), "none");
    assert.equal(
      describeConfidence(believe([report({ at: agoMin(0) })], NOW)),
      "fresh"
    );
    assert.equal(
      describeConfidence(believe([report({ at: agoMin(30) })], NOW)),
      "stale"
    );
  });

  /* The distinction the app cannot afford to lose.
   *
   * A claim's weight halves every four minutes for "free", so beyond about
   * three days the exponent underflows to zero and every report is skipped.
   * The belief that comes back is indistinguishable from the one a kerb
   * nobody has ever looked at produces — except for `considered`, which
   * counts what was weighed rather than what survived. */
  test("an expired claim is stale, not 'no reports at all'", () => {
    const ancient = believe([report({ at: agoMin(60 * 24 * 7) })], NOW);

    assert.ok(ancient.considered > 0, "the report was weighed and found spent");
    assert.equal(describeConfidence(ancient), "stale");
  });

  test("a kerb nobody has reported on is still 'none'", () => {
    assert.equal(describeConfidence(believe([], NOW)), "none");
  });

  test("an expired claim still has nobody to credit", () => {
    // A driver arriving today must not move the standing of somebody who said
    // "free" a week ago, so the source stays null however the badge reads.
    const ancient = believe([report({ at: agoMin(60 * 24 * 7) })], NOW);

    assert.equal(ancient.source, null);
  });

  test("calls a close vote disputed", () => {
    const belief = believe(
      [
        report({ status: "free", at: agoMin(0), reporterId: "a" }),
        report({ status: "taken", at: agoMin(0), reporterId: "b" }),
      ],
      NOW
    );
    assert.equal(describeConfidence(belief), "disputed");
  });
});

describe("spot-belief bridge", () => {
  test("reads a spot with no filed reports as the single claim it is", async () => {
    const { reportsFor, withBelief } = await import("../lib/spot-belief.ts");

    const spot = {
      id: "s9",
      title: "Strada Lipscani",
      access: "public" as const,
      status: "free" as const,
      latitude: 44.43,
      longitude: 26.1,
      updatedAt: agoMin(1),
      reportedBy: "Ana",
    };

    const reports = reportsFor(spot);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].reporterId, "Ana");
    assert.equal(reports[0].status, "free");

    const believed = withBelief(spot, NOW);
    assert.equal(believed.title, spot.title, "the original fields survive");
    assert.ok(believed.belief.confidence > 0);
    assert.equal(typeof believed.confidenceLevel, "string");
  });

  test("an anonymous seed spot still gets a reporter id", async () => {
    const { reportsFor } = await import("../lib/spot-belief.ts");
    const [only] = reportsFor({
      id: "s10",
      title: "x",
      access: "public" as const,
      status: "taken" as const,
      latitude: 0,
      longitude: 0,
      updatedAt: agoMin(3),
    });
    assert.equal(only.reporterId, "anon:s10");
  });

  test("ranks the freshest claims first", async () => {
    const { withBeliefs, rankByConfidence } = await import("../lib/spot-belief.ts");
    const make = (id: string, min: number) => ({
      id,
      title: id,
      access: "public" as const,
      status: "free" as const,
      latitude: 0,
      longitude: 0,
      updatedAt: agoMin(min),
      reportedBy: "r1",
    });
    const ranked = rankByConfidence(withBeliefs([make("old", 20), make("new", 0)], NOW));
    assert.equal(ranked[0].id, "new");
    assert.equal(ranked[1].id, "old");
    assert.equal(ranked[1].belief.stale, true, "the old one is kept, just marked");
  });
});

describe("age and corroboration are separate questions", () => {
  test("a single brand new claim is uncorroborated, not stale", () => {
    const belief = believe([report({ at: agoMin(0), reporterId: "someone" })], NOW);

    assert.equal(belief.stale, false, "one second old is not old");
    assert.equal(belief.corroboration, 1, "and one person has said it");
    assert.ok(belief.freshness > 0.9, `freshness is about age alone: ${belief.freshness}`);
  });

  test("age alone still makes something stale, however many said it", () => {
    const belief = believe(
      [
        report({ at: agoMin(20), reporterId: "a" }),
        report({ at: agoMin(20), reporterId: "b" }),
      ],
      NOW
    );
    assert.equal(belief.stale, true, "20 minutes on a 4 minute half-life");
    assert.equal(describeConfidence(belief), "stale");
  });

  test("a fresh claim two people agree on is neither", () => {
    const belief = believe(
      [
        report({ at: agoMin(0), reporterId: "a" }),
        report({ at: agoMin(0), reporterId: "b" }),
      ],
      NOW
    );
    assert.equal(belief.stale, false);
    assert.equal(belief.corroboration, 2);
    assert.equal(describeConfidence(belief), "fresh");
  });

  test("the seed data does not read as one flat wall of staleness", () => {
    // Ten spots with the ages the fixtures actually use. Before splitting the
    // two axes every one of them came back stale.
    const ages = [2, 1, 6, 9, 3, 2, 11, 14, 1, 2];
    const levels = ages.map((age) =>
      describeConfidence(believe([report({ at: agoMin(age) })], NOW))
    );
    const stale = levels.filter((l) => l === "stale").length;
    assert.ok(stale < ages.length, `all ${ages.length} spots read as stale`);
    assert.ok(stale > 0, "and the genuinely old ones still do");
  });
});
