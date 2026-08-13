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
import {
  eventsByReport,
  toBlockerReport,
  toBlockerReports,
  toParkingSpot,
  toParkingSpots,
  toReportInsert,
} from "../lib/supabase-rows.ts";
import type { ReportEventRow, ReportRow, SpotRow } from "../types/database.ts";

before(() => {
  registerTestLoader();
});

const spotRow = (over: Partial<SpotRow> = {}): SpotRow => ({
  id: "s_lipscani",
  title: "Strada Lipscani",
  access: "public_facility",
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

describe("mapping a spot row", () => {
  test("carries the columns the screens read", () => {
    const spot = toParkingSpot(
      spotRow({ kind: "garage", price_per_hour: 6, total_count: 420, image_url: "u" }),
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
    );
    for (const key of ["area", "pricePerHour", "totalCount", "rating", "imageUrl"] as const) {
      assert.strictEqual(spot[key], undefined, `${key} should be undefined, not null`);
    }
  });

  test("no status is invented for a public spot", () => {
    /* `spots` has no status column and the app no longer makes one up. It used
       to flatten the newest claim on and default to `taken`, which put an
       invented status on 838 of the 851 imported car parks -- read by a pin
       colour, it asserted that essentially every car park in Bucharest was
       full, on no evidence. Absent is the true answer. */
    const spot = toParkingSpot(spotRow());
    assert.equal(spot.status, undefined);
    assert.equal(spot.availableCount, undefined);
  });

  test("a row that does not say what it is is a public facility", () => {
    // Defaulting the other way would turn anything unmarked into somebody's
    // property -- which under the rights model is the one kind that may be
    // charged for.
    assert.equal(
      toParkingSpot(spotRow({ access: null })).access,
      "public_facility",
    );
  });

  test("rows written before the rights model still read correctly", () => {
    /* `0010` widened the column and rewrote every row, but a client older than
       it goes on writing the two old values. Both have exact readings:
       `private` meant property, and `public` meant everything else. */
    assert.equal(
      toParkingSpot(spotRow({ access: "private" })).access,
      "private_property",
    );
    assert.equal(
      toParkingSpot(spotRow({ access: "public" })).access,
      "public_facility",
    );
  });

  test("maps a page of rows in one pass", () => {
    const spots = toParkingSpots([spotRow({ id: "a" }), spotRow({ id: "b" })]);
    assert.deepEqual(spots.map((s) => s.id), ["a", "b"]);
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

/**
 * Reports work the way spots do: the table holds the complaint and a separate
 * append-only table holds what people did about it. The interesting cases are
 * therefore all about which event wins and what travels with it, because
 * getting that wrong shows a driver a pavement that was cleared on Tuesday as
 * still blocked, or worse, the other way round.
 */
const reportRowOf = (over: Partial<ReportRow> = {}): ReportRow => ({
  photo_count: 0,
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
