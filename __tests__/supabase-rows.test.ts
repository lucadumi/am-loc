/**
 * Tests for the database boundary: `lib/supabase-rows.ts` and the gate in
 * `lib/remote.ts`.
 *
 * The mapping is the part of the Supabase wiring most likely to be wrong and
 * the part a live Postgres would otherwise be needed to check, which is why it
 * was written as pure functions over plain rows. Nothing here touches a
 * network, a device or a credential.
 *
 * The last suite is the important one. It covers a double-counting bug the
 * remote shape introduces and the local one cannot: a spot loaded from
 * Supabase carries the newest claim flattened onto it *and* receives that same
 * claim again in the filed reports.
 */

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import { registerTestLoader } from "./register-loader.ts";

import { isRemote, supabaseCredentials } from "../lib/remote.ts";
import { believe } from "../lib/spot-state.ts";
import {
  eventsByReport,
  latestBySpot,
  toBlockerReport,
  toBlockerReports,
  toParkingSpot,
  toParkingSpots,
  toReportInsert,
  toSpotReport,
} from "../lib/supabase-rows.ts";
import type {
  ReportEventRow,
  ReportRow,
  SpotRow,
  StatusReportRow,
} from "../types/database.ts";

let belief: typeof import("../lib/spot-belief.ts");
let reports: typeof import("../lib/spot-reports.ts");

before(async () => {
  registerTestLoader();
  belief = await import("../lib/spot-belief.ts");
  reports = await import("../lib/spot-reports.ts");
});

const spotRow = (over: Partial<SpotRow> = {}): SpotRow => ({
  id: "s_lipscani",
  title: "Strada Lipscani",
  access: "public",
  source: "community",
  owner_id: null,
  owner_name: null,
  kind: "street",
  area: "Centrul Vechi",
  latitude: 44.4319,
  longitude: 26.1015,
  price_per_hour: null,
  paid: null,
  total_count: null,
  rating: 4.4,
  image_url: null,
  created_by: "11111111-1111-4111-8111-111111111111",
  created_at: "2026-08-03T09:00:00.000Z",
  ...over,
});

const reportRow = (over: Partial<StatusReportRow> = {}): StatusReportRow => ({
  id: 1,
  spot_id: "s_lipscani",
  status: "free",
  leaving_in_min: null,
  spaces: null,
  reporter_id: "22222222-2222-4222-8222-222222222222",
  created_at: "2026-08-03T11:00:00.000Z",
  ...over,
});

describe("reading status report rows", () => {
  test("renames the columns the app's model expects", () => {
    const report = toSpotReport(
      reportRow({ spot_id: "s1", status: "leaving", leaving_in_min: 5 })
    );
    assert.deepEqual(report, {
      spotId: "s1",
      status: "leaving",
      at: "2026-08-03T11:00:00.000Z",
      reporterId: "22222222-2222-4222-8222-222222222222",
      leavingInMin: 5,
      spaces: undefined,
    });
  });

  test("a null column becomes undefined, not null", () => {
    const report = toSpotReport(reportRow({ leaving_in_min: null }));
    // Postgres has one idea of absence and TypeScript has two. A null leaking
    // through here would reach props typed `number | undefined` and read as
    // "leaving in null minutes" the moment anything formatted it.
    assert.equal(report.leavingInMin, undefined);
    assert.ok(!Object.values(report).includes(null as never));
  });
});

describe("picking the newest claim per spot", () => {
  test("does not trust the query's ordering", () => {
    const latest = latestBySpot([
      reportRow({ id: 1, spot_id: "a", created_at: "2026-08-03T10:00:00.000Z" }),
      reportRow({ id: 2, spot_id: "a", created_at: "2026-08-03T12:00:00.000Z" }),
      reportRow({ id: 3, spot_id: "a", created_at: "2026-08-03T11:00:00.000Z" }),
      reportRow({ id: 4, spot_id: "b", created_at: "2026-08-03T09:00:00.000Z" }),
    ]);
    assert.equal(latest.get("a")?.id, 2);
    assert.equal(latest.get("b")?.id, 4);
  });
});

describe("flattening a spot row", () => {
  test("takes its status and time from the newest claim", () => {
    const spot = toParkingSpot(
      spotRow(),
      reportRow({ status: "leaving", leaving_in_min: 8 })
    );
    assert.equal(spot.status, "leaving");
    assert.equal(spot.updatedAt, "2026-08-03T11:00:00.000Z");
    assert.equal(spot.leavingInMin, 8);
    assert.equal(spot.reportedBy, "22222222-2222-4222-8222-222222222222");
  });

  test("carries the columns the screens read", () => {
    const spot = toParkingSpot(
      spotRow({ kind: "garage", price_per_hour: 6, total_count: 420, image_url: "u" }),
      reportRow()
    );
    assert.equal(spot.kind, "garage");
    assert.equal(spot.pricePerHour, 6);
    assert.equal(spot.totalCount, 420);
    assert.equal(spot.imageUrl, "u");
    assert.equal(spot.area, "Centrul Vechi");
    assert.equal(spot.rating, 4.4);
  });

  test("nulls become undefined so optional props stay optional", () => {
    const spot = toParkingSpot(
      spotRow({ area: null, price_per_hour: null, total_count: null, rating: null, image_url: null }),
      reportRow()
    );
    for (const key of ["area", "pricePerHour", "totalCount", "rating", "imageUrl"] as const) {
      assert.strictEqual(spot[key], undefined, `${key} should be undefined, not null`);
    }
  });

  test("a spot nobody has reported on reads as taken, as of its creation", () => {
    // Not an arbitrary default. Calling it free would advertise a space on no
    // evidence at all, and because `updatedAt` is the spot's own creation time
    // the belief model ages the non-claim out to stale by itself.
    const spot = toParkingSpot(spotRow());
    assert.equal(spot.status, "taken");
    assert.equal(spot.updatedAt, "2026-08-03T09:00:00.000Z");
    assert.equal(spot.leavingInMin, undefined);
  });

  test("and that placeholder is attributed to nobody", () => {
    // Falling back to `created_by` here would let anyone earn a reputation
    // from claims they never made: add spots, wait for the report window to
    // pass, and collect a confirmation from every driver who agrees the kerb
    // is occupied. The whole point of the schema is that this cannot happen.
    const spot = toParkingSpot(spotRow());
    assert.equal(spot.reportedBy, undefined);
    assert.notEqual(spot.reportedBy, spotRow().created_by);
  });

  test("joins many spots to their claims in one pass", () => {
    const spots = toParkingSpots(
      [spotRow({ id: "a" }), spotRow({ id: "b" }), spotRow({ id: "c" })],
      [
        reportRow({ spot_id: "a", status: "free" }),
        reportRow({ spot_id: "b", status: "taken" }),
      ]
    );
    assert.deepEqual(
      spots.map((s) => [s.id, s.status]),
      [["a", "free"], ["b", "taken"], ["c", "taken"]]
    );
  });
});

describe("the gate that decides which data layer runs", () => {
  test("no credentials means the bundled seeds, not a crash", () => {
    // The unit tests run with no EXPO_PUBLIC_ variables set, which is exactly
    // the state of a fresh clone: `.env` is gitignored, so nobody checking the
    // repo out has credentials and the app still has to open.
    assert.equal(isRemote(), false);
    assert.equal(supabaseCredentials(), null);
  });
});

describe("a remote spot's claim is not counted twice", () => {
  const NOW = new Date("2026-08-03T11:05:00.000Z");

  /** A spot as `toParkingSpot` builds it, plus the rows it was built from. */
  const remote = () => {
    const rows = [
      reportRow({ id: 2, status: "free", created_at: "2026-08-03T11:00:00.000Z", reporter_id: "newest" }),
      reportRow({ id: 1, status: "taken", created_at: "2026-08-03T10:58:00.000Z", reporter_id: "older" }),
    ];
    return { spot: toParkingSpots([spotRow()], rows)[0], filed: rows.map(toSpotReport) };
  };

  test("the flattened claim and its own row are one observation", () => {
    const { spot, filed } = remote();
    const reports = belief.reportsFor(spot, filed);
    assert.equal(reports.length, 2, "two rows should stay two claims, not three");
    assert.equal(
      reports.filter((r) => r.reporterId === "newest").length,
      1,
      "the newest reporter must not appear twice"
    );
  });

  test("so a duplicated claim cannot flip what the map shows", () => {
    const { spot, filed } = remote();
    const counted = belief.withBelief(spot, NOW, filed);

    assert.equal(counted.belief.considered, 2);
    assert.ok(counted.belief.contested, "two reporters disagreeing reads as contested");
    // "taken" decays over 25 minutes and "free" over 4, so five minutes on the
    // older contradiction is still the better evidence.
    assert.equal(counted.belief.status, "taken");

    // The same rows read the way `reportsFor` read them before it
    // deduplicated: the flattened claim counted again as a report of its own.
    // `believe` sums weight per status with no per-reporter check, so the
    // second copy simply doubles that status's vote and buys the win.
    const doubled = believe([reports.seedReport(spot), ...filed], NOW);
    assert.equal(doubled.considered, 3);
    assert.equal(
      doubled.status,
      "free",
      "counting one observation twice is enough to overturn the verdict"
    );
  });

  test("a genuinely new claim is still added to the seed one", () => {
    // The local path has no flattened duplicate, so nothing may be dropped
    // there: the seed claim a fixture carries is still a claim.
    const local = {
      id: "s1",
      title: "Strada Lipscani",
      access: "public" as const,
      status: "free" as const,
      latitude: 44.43,
      longitude: 26.1,
      updatedAt: "2026-08-03T11:00:00.000Z",
      reportedBy: "ana",
    };
    const filed = [
      { spotId: "s1", status: "taken" as const, at: "2026-08-03T11:02:00.000Z", reporterId: "bogdan" },
    ];
    assert.equal(belief.reportsFor(local, filed).length, 2);
  });
});

/**
 * Reports work the way spots do: the table holds the complaint and a separate
 * append-only table holds what people did about it. The interesting cases are
 * therefore all about which event wins and what travels with it, because
 * getting that wrong shows a driver a pavement that was cleared on Tuesday as
 * still blocked, or worse, the other way round.
 */
const reportRowOf = (over: Partial<ReportRow> = {}): ReportRow => ({
  id: "r_1",
  category: "sidewalk",
  latitude: 44.4319,
  longitude: 26.1015,
  address: "Strada Lipscani",
  plate: null,
  note: null,
  photos: [],
  created_by: "11111111-1111-4111-8111-111111111111",
  created_at: "2026-08-03T09:00:00.000Z",
  ...over,
});

const eventRow = (over: Partial<ReportEventRow> = {}): ReportEventRow => ({
  id: 1,
  report_id: "r_1",
  kind: "forwarded",
  photos: [],
  actor: "11111111-1111-4111-8111-111111111111",
  created_at: "2026-08-03T10:00:00.000Z",
  ...over,
});

describe("reading report rows", () => {
  test("a report nobody has acted on is open", () => {
    // The definition that cannot drift: there is no column to forget.
    assert.equal(toBlockerReport(reportRowOf()).status, "open");
  });

  test("the newest event decides where a report got to", () => {
    const report = toBlockerReport(reportRowOf(), [
      eventRow({ id: 2, kind: "forwarded", created_at: "2026-08-04T10:00:00.000Z" }),
      eventRow({
        id: 1,
        kind: "resolved",
        photos: ["https://x/gone.jpg"],
        created_at: "2026-08-03T10:00:00.000Z",
      }),
    ]);

    assert.equal(
      report.status,
      "forwarded",
      "a report closed and then forwarded again is forwarded, which is what happened to it",
    );
    assert.equal(report.resolution, undefined);
  });

  test("closing a report carries the proof and who supplied it", () => {
    const report = toBlockerReport(reportRowOf(), [
      eventRow({
        kind: "resolved",
        photos: ["https://x/gone-1.jpg", "https://x/gone-2.jpg"],
        actor: "22222222-2222-4222-8222-222222222222",
      }),
    ]);

    assert.equal(report.status, "resolved");
    assert.deepEqual(report.resolution?.photos, [
      "https://x/gone-1.jpg",
      "https://x/gone-2.jpg",
    ]);
    assert.equal(
      report.resolution?.by,
      "22222222-2222-4222-8222-222222222222",
      "the proof belongs to whoever went back and looked, not to who complained",
    );
  });

  test("nulls become absences, and an empty photo array is no photos", () => {
    const report = toBlockerReport(reportRowOf({ plate: null, note: null }));

    assert.equal(report.plate, undefined);
    assert.equal(report.note, undefined);
    assert.equal(report.photos, undefined);
  });

  test("events are matched to their own report and ordered newest first", () => {
    const byReport = eventsByReport([
      eventRow({ id: 1, report_id: "r_1", created_at: "2026-08-03T10:00:00.000Z" }),
      eventRow({ id: 2, report_id: "r_2", created_at: "2026-08-03T11:00:00.000Z" }),
      eventRow({ id: 3, report_id: "r_1", created_at: "2026-08-04T10:00:00.000Z" }),
    ]);

    assert.deepEqual(byReport.get("r_1")?.map((e) => e.id), [3, 1]);
    assert.deepEqual(byReport.get("r_2")?.map((e) => e.id), [2]);
  });

  test("a query that forgot to order is still mapped correctly", () => {
    // The same guarantee `latestBySpot` makes, and for the same reason.
    const reports = toBlockerReports(
      [reportRowOf({ id: "r_1" }), reportRowOf({ id: "r_2" })],
      [
        eventRow({
          id: 1,
          report_id: "r_1",
          kind: "resolved",
          photos: ["https://x/a.jpg"],
          created_at: "2026-08-05T10:00:00.000Z",
        }),
        eventRow({
          id: 2,
          report_id: "r_1",
          kind: "forwarded",
          created_at: "2026-08-04T10:00:00.000Z",
        }),
      ],
    );

    assert.deepEqual(
      reports.map((r) => [r.id, r.status]),
      [
        ["r_1", "resolved"],
        ["r_2", "open"],
      ],
    );
  });
});

describe("writing report rows", () => {
  test("a new report is written as the signed-in user", () => {
    const insert = toReportInsert(
      {
        id: "r_9",
        category: "ramp",
        latitude: 44.42,
        longitude: 26.1,
        createdAt: "2026-08-03T11:00:00.000Z",
        status: "open",
        reportedBy: "me",
        photos: ["https://x/a.jpg"],
      },
      "33333333-3333-4333-8333-333333333333",
    );

    assert.equal(insert.created_by, "33333333-3333-4333-8333-333333333333");
    assert.deepEqual(insert.photos, ["https://x/a.jpg"]);
    assert.strictEqual(insert.plate, null);
    assert.strictEqual(insert.note, null);
  });

  test("a report with no photographs is an empty array, not a null", () => {
    // The column is `not null default '{}'`; a null would be rejected.
    const insert = toReportInsert(
      {
        id: "r_10",
        category: "crosswalk",
        latitude: 44.42,
        longitude: 26.1,
        createdAt: "2026-08-03T11:00:00.000Z",
        status: "open",
        reportedBy: "me",
      },
      "33333333-3333-4333-8333-333333333333",
    );

    assert.deepEqual(insert.photos, []);
  });
});
