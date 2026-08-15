/**
 * Tests for lib/privacy.ts.
 *
 * The module is a set of promises made on a screen, and the promises are about
 * deletion. So the tests are mostly about the awkward half -- what does *not*
 * go -- because that is where a privacy screen lies without meaning to: it is
 * easy to list what you delete and easy to forget that the list is not the
 * whole schema.
 *
 * The register is checked for totality rather than for content. Its content is
 * prose and will be edited; what must not change is that every category has
 * picked a fate and that the two filters between them cover all of it, because
 * a category that fell out of both would be one the person is never told
 * about at all.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DATA_CATEGORIES,
  type DataExport,
  type ErasureReceipt,
  exportFileName,
  exportLineLabel,
  exportToText,
  receiptLines,
  summariseExport,
  whatErasureKeeps,
  whatErasureRemoves,
} from "../lib/privacy.ts";

const receipt = (over: Partial<ErasureReceipt> = {}): ErasureReceipt => ({
  reports_deleted: 0,
  availability_windows_deleted: 0,
  private_spots_deleted: 0,
  actions_kept_unattributed: 0,
  storage_prefix: "abc/",
  login_and_photos_pending: true,
  ...over,
});

const emptyExport = (over: Partial<DataExport> = {}): DataExport => ({
  exported_at: "2026-08-15T12:00:00Z",
  account: { id: "abc" },
  profile: null,
  roles: [],
  reports: [],
  actions_on_reports: [],
  spots: [],
  availability_windows: [],
  who_opened_my_evidence: [],
  erasure_requests: [],
  ...over,
});

describe("the register", () => {
  test("every category has picked a fate", () => {
    for (const category of DATA_CATEGORIES) {
      assert.ok(
        ["deleted", "severed", "kept"].includes(category.fate),
        `${category.key} has no fate`,
      );
    }
  });

  test("every category says something in all four columns", () => {
    for (const category of DATA_CATEGORIES) {
      for (const field of ["what", "kept", "onErasure"] as const) {
        assert.ok(
          category[field].trim().length > 0,
          `${category.key} says nothing about ${field}`,
        );
      }
    }
  });

  test("the two filters between them cover everything", () => {
    assert.equal(
      whatErasureRemoves().length + whatErasureKeeps().length,
      DATA_CATEGORIES.length,
    );
  });

  test("no category is in both", () => {
    const removed = new Set(whatErasureRemoves().map((c) => c.key));
    for (const kept of whatErasureKeeps()) {
      assert.ok(!removed.has(kept.key), `${kept.key} is both kept and removed`);
    }
  });

  test("keys are unique, or a screen renders two rows with one key", () => {
    const keys = DATA_CATEGORIES.map((c) => c.key);
    assert.equal(new Set(keys).size, keys.length);
  });

  // The two exceptions the migration is built around. If either of these ever
  // moves into `deleted`, the screen has started promising something the
  // database does not do.
  test("the official resolution survives, and says so", () => {
    const entry = DATA_CATEGORIES.find((c) => c.key === "official_resolutions");
    assert.equal(entry?.fate, "kept");
  });

  test("the erasure request itself survives", () => {
    const entry = DATA_CATEGORIES.find((c) => c.key === "erasure_requests");
    assert.equal(entry?.fate, "kept");
  });

  test("a public spot is severed rather than deleted", () => {
    const entry = DATA_CATEGORIES.find((c) => c.key === "public_spots");
    assert.equal(entry?.fate, "severed");
  });

  test("a private spot is deleted rather than severed", () => {
    const entry = DATA_CATEGORIES.find((c) => c.key === "private_spots");
    assert.equal(entry?.fate, "deleted");
  });
});

describe("the receipt", () => {
  test("says nothing about the counts that are zero", () => {
    const lines = receiptLines(receipt());
    assert.equal(lines.length, 1);
    assert.match(lines[0], /30 de zile/);
  });

  test("always admits the login is still there", () => {
    const lines = receiptLines(receipt({ reports_deleted: 4 }));
    assert.match(lines.at(-1)!, /autentificarea/);
  });

  test("counts one report in the singular", () => {
    const lines = receiptLines(receipt({ reports_deleted: 1 }));
    assert.match(lines[0], /^1 sesizare ștearsă\./);
  });

  test("counts three in the bare plural", () => {
    const lines = receiptLines(receipt({ reports_deleted: 3 }));
    assert.match(lines[0], /^3 sesizări șterse\./);
  });

  // Romanian's third agreement class, and the one a hand-written version drops.
  test("counts twenty with 'de'", () => {
    const lines = receiptLines(receipt({ reports_deleted: 20 }));
    assert.match(lines[0], /^20 de sesizări șterse\./);
  });

  test("counts on the last two digits, not the number", () => {
    const bare = receiptLines(receipt({ reports_deleted: 103 }));
    assert.match(bare[0], /^103 sesizări șterse\./);
    const withDe = receiptLines(receipt({ reports_deleted: 120 }));
    assert.match(withDe[0], /^120 de sesizări șterse\./);
  });

  test("mentions what stays behind unattributed", () => {
    const lines = receiptLines(receipt({ actions_kept_unattributed: 2 }));
    assert.ok(lines.some((l) => /fără numele tău/.test(l)));
  });

  test("reports come before the acts that outlive them", () => {
    const lines = receiptLines(
      receipt({ reports_deleted: 1, actions_kept_unattributed: 1 }),
    );
    assert.match(lines[0], /sesizare/);
    assert.match(lines[1], /acțiune/);
  });
});

describe("the export", () => {
  test("an empty account summarises to nothing rather than to zeroes", () => {
    assert.deepEqual(summariseExport(emptyExport()), []);
  });

  test("counts what is there", () => {
    const lines = summariseExport(
      emptyExport({ reports: [1, 2], spots: [1] } as Partial<DataExport>),
    );
    assert.deepEqual(lines, [
      { label: "sesizări", count: 2 },
      { label: "locuri", count: 1 },
    ]);
  });

  // The line that is the point of the screen.
  test("tells them their photographs were opened", () => {
    const lines = summariseExport(
      emptyExport({ who_opened_my_evidence: [1] } as Partial<DataExport>),
    );
    assert.equal(lines.length, 1);
    assert.equal(exportLineLabel(lines[0]), "1 deschidere a pozelor tale");
  });

  test("agrees the noun with the number", () => {
    assert.equal(exportLineLabel({ label: "sesizări", count: 1 }), "1 sesizare");
    assert.equal(exportLineLabel({ label: "sesizări", count: 5 }), "5 sesizări");
    assert.equal(
      exportLineLabel({ label: "sesizări", count: 20 }),
      "20 de sesizări",
    );
  });

  test("survives a payload whose arrays are missing", () => {
    const broken = { exported_at: "x" } as unknown as DataExport;
    assert.deepEqual(summariseExport(broken), []);
  });

  test("is named for the day it was taken", () => {
    const name = exportFileName(new Date(2026, 7, 5));
    assert.equal(name, "am-loc-datele-mele-2026-08-05.json");
  });

  test("is indented, so it can be read as well as parsed", () => {
    const text = exportToText(emptyExport());
    assert.ok(text.includes("\n  "));
    assert.equal(JSON.parse(text).account.id, "abc");
  });
});
