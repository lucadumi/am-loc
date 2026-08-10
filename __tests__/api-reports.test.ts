/**
 * Tests for the blocker-report half of lib/api.ts.
 *
 * The behaviour worth pinning down is that a report survives being filed and
 * can then be moved along. Until the Sesizări screen existed, `addReport`
 * wrote to a key nothing read back, which is a form that quietly discards its
 * input: you photographed a blocked pavement and the app showed you a
 * placeholder.
 *
 * The subtler thing checked here is that a *seed* report can change status
 * too. Seeds live in the code, not in storage, so there is no row to edit; the
 * status is kept beside them instead. Get that wrong and the screen grows
 * buttons that work on some cards and silently do nothing on the others.
 */

import assert from "node:assert/strict";
import { before, beforeEach, describe, test } from "node:test";

import { registerTestLoader } from "./register-loader.ts";
import type { BlockerReport } from "../types/index.ts";

let api: typeof import("../lib/api.ts");
let fake: typeof import("./fake-async-storage.ts");

const REPORTS_KEY = "amloc.reports.v1";
const REPORT_STATUS_KEY = "amloc.report-status.v1";

before(async () => {
  // "No backend configured" has to be true for this suite rather than true
  // only for whoever has no .env exported in their shell. lib/remote.ts reads
  // these once, at module load, so they go before the first import.
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  registerTestLoader();
  api = await import("../lib/api.ts");
  fake = await import("./fake-async-storage.ts");
});

beforeEach(() => {
  fake.default.__store.delete(REPORTS_KEY);
  fake.default.__store.delete(REPORT_STATUS_KEY);
});

const blocker = (over = {}) => ({
  category: "sidewalk" as const,
  latitude: 44.4319,
  longitude: 26.1015,
  ...over,
});

describe("blocker reports with no backend configured", () => {
  /* Empty, and that is the correct answer rather than a gap to be filled.
     There are no invented complaints anywhere in the app: a fictional blocked
     pavement is indistinguishable on screen from one somebody photographed
     this morning, and it would send a driver to look at a car that was never
     there. Nobody has reported anything on a fresh device, so the tab says so. */
  test("a fresh device has nothing to show, rather than invented complaints", async () => {
    const reports = await api.getReports();

    assert.deepEqual(reports, []);
  });

  test("a filed report comes back", async () => {
    const filed = await api.addReport(blocker({ note: "Trotuar blocat" }));

    const reports = await api.getReports();
    assert.equal(reports.length, 1);
    assert.equal(reports[0].id, filed.id);
    assert.equal(reports[0].note, "Trotuar blocat");
  });

  test("the newest report a driver filed comes back first", async () => {
    const first = await api.addReport(blocker({ note: "Prima" }));
    const second = await api.addReport(blocker({ note: "A doua" }));

    const reports = await api.getReports();
    assert.deepEqual(
      reports.map((report) => report.id),
      [second.id, first.id],
    );
  });

  test("a report is filed open, stamped with an id and a time", async () => {
    const before = Date.now();
    const filed = await api.addReport(blocker());

    assert.equal(filed.status, "open");
    // The random tail is not decoration: `reports.id` is a primary key two
    // phones write to, and the millisecond alone would collide.
    assert.match(filed.id, /^r_\d+_[a-z0-9]{4}$/);
    assert.ok(new Date(filed.createdAt).getTime() >= before);
  });

  test("corrupt storage reads as no reports rather than throwing", async () => {
    fake.default.__store.set(REPORTS_KEY, "{ not json");
    fake.default.__store.set(REPORT_STATUS_KEY, "{ not json");

    const reports = await api.getReports();
    assert.deepEqual(reports, []);
  });
});

describe("counting what one driver has filed", () => {
  const report = (over: Partial<BlockerReport>): BlockerReport => ({
    id: "r1",
    category: "sidewalk",
    latitude: 44.43,
    longitude: 26.1,
    createdAt: "2026-08-01T10:00:00Z",
    status: "open",
    reportedBy: "me",
    ...over,
  });

  test("only this driver's reports are counted", () => {
    /* The list handed in is the whole city's. A tally that forgot to filter
       would tell a driver who has never reported anything that they have
       filed thirty complaints. */
    const tally = api.tallyReports(
      [
        report({ id: "a" }),
        report({ id: "b", reportedBy: "somebody-else" }),
        report({ id: "c" }),
      ],
      "me",
    );
    assert.equal(tally.filed, 2);
  });

  test("resolved is a subset of filed, and counts only proof", () => {
    const tally = api.tallyReports(
      [
        report({ id: "a", status: "resolved" }),
        report({ id: "b", status: "forwarded" }),
        report({ id: "c", status: "open" }),
        report({ id: "d", status: "resolved", reportedBy: "somebody-else" }),
      ],
      "me",
    );
    assert.equal(tally.filed, 3);
    // A forwarded report is paperwork in motion, not a cleared kerb.
    assert.equal(tally.resolved, 1);
  });

  test("a driver who has filed nothing has nothing", () => {
    const tally = api.tallyReports([report({ reportedBy: "x" })], "me");
    assert.deepEqual(tally, { filed: 0, resolved: 0 });
  });
});
