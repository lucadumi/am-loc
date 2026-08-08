/**
 * Tests for lib/report-place.ts.
 *
 * The rule that decides whether a blocked pavement gets filed at the place it
 * is, or at the centre of Bucharest. It replaced a fallback that did the
 * second, so the case worth pinning hardest is the one that used to pass
 * silently: no fix, nothing placed, file anyway.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { mayFileAt } from "../lib/report-place.ts";

describe("whether a report has a place worth filing on", () => {
  test("a GPS fix is enough on its own", () => {
    assert.equal(mayFileAt({ placed: false, source: "gps" }), true);
  });

  /* The regression this exists for. An IP fix is a suburb at best and the
     fallback is the middle of the city, and the old screen filed on both. */
  test("a fix the app guessed at is not", () => {
    assert.equal(mayFileAt({ placed: false, source: "ip" }), false);
    assert.equal(mayFileAt({ placed: false, source: "fallback" }), false);
  });

  test("no fix at all is not", () => {
    assert.equal(mayFileAt({ placed: false }), false);
  });

  test("placing the pin makes any of those filable", () => {
    for (const source of ["ip", "fallback", undefined] as const) {
      assert.equal(
        mayFileAt({ placed: true, source }),
        true,
        `placing the pin should be enough with source=${source}`,
      );
    }
  });

  /* Nobody is locked out: a driver underground, or with location off entirely,
     files by saying where rather than by having the app guess in their name. */
  test("there is always a way to file", () => {
    assert.equal(mayFileAt({ placed: true }), true);
  });

  test("an edit keeps the place it was filed with", () => {
    // The coordinates were vouched for once and Postgres refuses to move them;
    // re-checking the driver's current fix would only block a note being fixed.
    assert.equal(mayFileAt({ placed: false, editing: true }), true);
    assert.equal(
      mayFileAt({ placed: false, source: "fallback", editing: true }),
      true,
    );
  });
});
