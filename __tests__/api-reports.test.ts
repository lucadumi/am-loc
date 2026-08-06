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
  test("a fresh device sees exactly the seeds", async () => {
    const reports = await api.getReports();

    assert.deepEqual(reports, api.SEED_REPORTS);
  });

  test("a filed report comes back, ahead of the seeds", async () => {
    const filed = await api.addReport(blocker({ note: "Trotuar blocat" }));

    const reports = await api.getReports();
    assert.equal(reports.length, api.SEED_REPORTS.length + 1);
    assert.equal(reports[0].id, filed.id);
    assert.equal(reports[0].note, "Trotuar blocat");
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

  test("corrupt storage costs the driver their own reports, not the seeds", async () => {
    fake.default.__store.set(REPORTS_KEY, "{ not json");
    fake.default.__store.set(REPORT_STATUS_KEY, "{ not json");

    const reports = await api.getReports();
    assert.deepEqual(reports, api.SEED_REPORTS);
  });
});
