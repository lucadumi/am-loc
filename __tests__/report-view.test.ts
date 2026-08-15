/**
 * Tests for lib/report-view.ts.
 *
 * Two kinds of question live in this module and they fail differently. Getting
 * an ordering wrong makes a list awkward; getting `mayViewEvidence` wrong
 * would offer somebody a photograph of a stranger's number plate. So the
 * evidence rule is over-represented below, and every case is written from the
 * point of view of the person who would be harmed.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  compareForReader,
  inboxFor,
  isMine,
  isSettled,
  mayEdit,
  mayViewEvidence,
  reportStatusLabel,
  reportStatusMeaning,
  unsettledCount,
} from "../lib/report-view.ts";
import type { Account, BlockerReport, Organisation, ReportStatus } from "../types/index.ts";

const AUTHOR = "8f1c0e4a-0000-4000-8000-000000000001";
const STRANGER = "8f1c0e4a-0000-4000-8000-000000000002";

const account = (over: Partial<Account> = {}): Account => ({
  id: STRANGER,
  anonymous: false,
  grants: [],
  assurance: "aal1",
  hasSecondFactor: false,
  passwordPending: false,
  trader: false,
  ...over,
});

const office = (over: Partial<Organisation> = {}): Organisation => ({
  id: "ps2",
  name: "Primăria Sectorului 2",
  kind: "sector_hall",
  jurisdiction: "sector_2",
  ...over,
});

/** A warden who has passed their second factor and acts for an office. */
const warden = (over: Partial<Account> = {}) =>
  account({ grants: ["resolver"], assurance: "aal2", organisation: office(), ...over });

const report = (over: Partial<BlockerReport> = {}): BlockerReport => ({
  id: "r1",
  category: "sidewalk",
  latitude: 44.45,
  longitude: 26.12,
  createdAt: "2026-08-01T10:00:00Z",
  status: "open",
  reportedBy: AUTHOR,
  sector: "sector_2",
  ...over,
});

describe("who may see the evidence", () => {
  test("the author, always", () => {
    assert.ok(mayViewEvidence(report(), account({ id: AUTHOR })));
  });

  test("a stranger, never", () => {
    /* The one that matters. A blocked pavement is a public fact; the
       photograph of it contains a number plate and often a face. */
    assert.ok(!mayViewEvidence(report(), account()));
  });

  test("a resolver in the right sector", () => {
    assert.ok(mayViewEvidence(report(), warden()));
  });

  test("not a resolver from another sector", () => {
    assert.ok(!mayViewEvidence(report({ sector: "sector_5" }), warden()));
  });

  test("not a resolver who has only typed a password", () => {
    // The second factor rule from #11 reaches this too: `holds` decides first.
    assert.ok(!mayViewEvidence(report(), warden({ assurance: "aal1" })));
  });

  test("not a resolver whose office is suspended", () => {
    /* Which is how a suspended or expired organisation arrives here:
       `acting_organisation()` returns null for both, so the account comes back
       with no office rather than with a dead one. */
    assert.ok(!mayViewEvidence(report(), warden({ organisation: undefined })));
  });

  test("a city-wide body, anywhere", () => {
    const mayoralty = warden({ organisation: office({ jurisdiction: "city" }) });
    assert.ok(mayViewEvidence(report({ sector: "sector_5" }), mayoralty));
  });

  test("an unplaceable report is open to any acting resolver", () => {
    assert.ok(mayViewEvidence(report({ sector: undefined }), warden()));
  });

  test("an admin is not a resolver", () => {
    // Running the project is not being a sector hall, and the evidence follows
    // the office rather than the seniority.
    const boss = account({ grants: ["admin"], assurance: "aal2" });
    assert.ok(!mayViewEvidence(report(), boss));
  });
});

describe("what an author may still change", () => {
  test("their own open report", () => {
    assert.ok(mayEdit(report(), account({ id: AUTHOR })));
  });

  test("not somebody else's", () => {
    assert.ok(!mayEdit(report(), account()));
  });

  test("not one already settled", () => {
    /* Editing under a photograph that answers the old claim would make the
       proof answer a question nobody asked. */
    for (const status of ["cleared", "resolved"] as ReportStatus[]) {
      assert.ok(!mayEdit(report({ status }), account({ id: AUTHOR })), status);
    }
  });

  test("a forwarded report is still theirs to correct", () => {
    // Forwarding is paperwork in motion, not an answer.
    assert.ok(mayEdit(report({ status: "forwarded" }), account({ id: AUTHOR })));
  });
});

describe("ordering a list", () => {
  test("what still needs doing comes first", () => {
    /* Newest-first is the tempting rule and it buries a week-old open report
       under this morning's cleared one, which is how the open ones stop being
       looked at. */
    const list = [
      report({ id: "cleared-today", status: "cleared", createdAt: "2026-08-10T10:00:00Z" }),
      report({ id: "open-last-week", status: "open", createdAt: "2026-08-03T10:00:00Z" }),
    ].sort(compareForReader);
    assert.deepEqual(list.map((r) => r.id), ["open-last-week", "cleared-today"]);
  });

  test("newest first among equals", () => {
    const list = [
      report({ id: "older", createdAt: "2026-08-01T10:00:00Z" }),
      report({ id: "newer", createdAt: "2026-08-09T10:00:00Z" }),
    ].sort(compareForReader);
    assert.deepEqual(list.map((r) => r.id), ["newer", "older"]);
  });

  test("only a resolution or a sighting settles one", () => {
    assert.ok(!isSettled(report({ status: "open" })));
    assert.ok(!isSettled(report({ status: "forwarded" })));
    assert.ok(isSettled(report({ status: "cleared" })));
    assert.ok(isSettled(report({ status: "resolved" })));
  });

  test("the count is of what is left to do", () => {
    assert.equal(
      unsettledCount([
        report({ status: "open" }),
        report({ status: "forwarded" }),
        report({ status: "resolved" }),
      ]),
      2,
    );
  });
});

describe("the inbox", () => {
  const across = [
    report({ id: "s2", sector: "sector_2" }),
    report({ id: "s5", sector: "sector_5" }),
    report({ id: "nowhere", sector: undefined }),
  ];

  test("a sector hall sees its own and the unplaceable", () => {
    const ids = inboxFor(across, warden()).map((r) => r.id).sort();
    assert.deepEqual(ids, ["nowhere", "s2"]);
  });

  test("a city-wide body sees everything", () => {
    const mayoralty = warden({ organisation: office({ jurisdiction: "city" }) });
    assert.equal(inboxFor(across, mayoralty).length, 3);
  });

  test("a driver has no inbox at all", () => {
    /* Not "an empty list of theirs" -- nothing. Otherwise the inbox quietly
       becomes a second list of everything for somebody who merely holds the
       grant. */
    assert.deepEqual(inboxFor(across, account()), []);
  });

  test("nor does a resolver who has not passed their second factor", () => {
    assert.deepEqual(inboxFor(across, warden({ assurance: "aal1" })), []);
  });

  test("it is ordered like any other list", () => {
    const list = inboxFor(
      [
        report({ id: "done", sector: "sector_2", status: "resolved", createdAt: "2026-08-10T00:00:00Z" }),
        report({ id: "todo", sector: "sector_2", status: "open", createdAt: "2026-08-01T00:00:00Z" }),
      ],
      warden(),
    );
    assert.deepEqual(list.map((r) => r.id), ["todo", "done"]);
  });
});

describe("what the words say", () => {
  test("every state has a name and a meaning", () => {
    for (const status of ["open", "forwarded", "cleared", "resolved"] as ReportStatus[]) {
      assert.ok(reportStatusLabel[status]);
      assert.ok(reportStatusMeaning[status]);
    }
  });

  test("a passer-by's sighting is not called a resolution", () => {
    /* The whole of #12 in one string. Calling it "Rezolvată" would have the
       app tell a driver an authority acted when nobody did. */
    assert.notEqual(reportStatusLabel.cleared, reportStatusLabel.resolved);
    assert.ok(!/rezolvat/i.test(reportStatusLabel.cleared));
  });
});

describe("isMine", () => {
  test("compares the author against the account", () => {
    assert.ok(isMine(report(), account({ id: AUTHOR })));
    assert.ok(!isMine(report(), account()));
  });
});
