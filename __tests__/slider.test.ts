/**
 * Tests for lib/slider.ts.
 *
 * These functions exist because a screen reader cannot drag. With VoiceOver or
 * TalkBack running, a swipe moves the reader's own cursor and never reaches a
 * pan handler, so the platform's answer is `accessibilityRole="adjustable"`
 * and two actions named `increment` and `decrement` -- which means an
 * accessible slider is one that can be *stepped*, and stepping is arithmetic.
 *
 * The interesting cases are all at the edges, and they are the ones a person
 * stepping by ear notices first: a value that never reaches its own end stop,
 * or a step that lands on 47 and then 62 because nothing snapped it to the
 * grid.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  clamp,
  fractionOf,
  spokenDuration,
  spokenPriceRange,
  stepValue,
  valueAt,
} from "../lib/slider.ts";

/** The interval slider's shape: minutes, in quarter hours. */
const MINUTES = { min: 15, max: 240, step: 15 };

describe("clamp", () => {
  test("keeps a value inside its bounds", () => {
    assert.equal(clamp(5, 0, 10), 5);
    assert.equal(clamp(-1, 0, 10), 0);
    assert.equal(clamp(11, 0, 10), 10);
  });
});

describe("stepping", () => {
  test("a value on the grid moves one whole step", () => {
    assert.equal(stepValue(60, 1, MINUTES), 75);
    assert.equal(stepValue(60, -1, MINUTES), 45);
  });

  test("a value off the grid is tidied onto it first", () => {
    /* The case that decides whether stepping by ear is usable. A value of 47
       came from a drag; stepping up should reach 60, not 62 -- otherwise every
       value after it is off by the same remainder forever. */
    assert.equal(stepValue(47, 1, MINUTES), 60);
    assert.equal(stepValue(47, -1, MINUTES), 45);
  });

  test("stepping never leaves the bounds", () => {
    assert.equal(stepValue(240, 1, MINUTES), 240);
    assert.equal(stepValue(15, -1, MINUTES), 15);
  });

  test("both end stops are reachable", () => {
    /* A slider that cannot be stepped to its own maximum is one where the last
       value is available by dragging and by nothing else -- which is exactly
       the state this module exists to end. */
    let value = MINUTES.min;
    for (let i = 0; i < 100 && value < MINUTES.max; i++) {
      value = stepValue(value, 1, MINUTES);
    }
    assert.equal(value, MINUTES.max);

    for (let i = 0; i < 100 && value > MINUTES.min; i++) {
      value = stepValue(value, -1, MINUTES);
    }
    assert.equal(value, MINUTES.min);
  });

  test("a range whose span is not a whole number of steps still ends", () => {
    // 0..10 by 3 gives 0, 3, 6, 9, then 10 rather than 12.
    const odd = { min: 0, max: 10, step: 3 };
    assert.equal(stepValue(9, 1, odd), 10);
    assert.equal(stepValue(10, 1, odd), 10);
  });
});

describe("position along the track", () => {
  test("a fraction is where the value sits", () => {
    assert.equal(fractionOf(15, 15, 240), 0);
    assert.equal(fractionOf(240, 15, 240), 1);
    assert.equal(fractionOf(127.5, 15, 240), 0.5);
  });

  test("a degenerate range is the start, not a division by zero", () => {
    assert.equal(fractionOf(5, 5, 5), 0);
  });

  test("a value out of range does not run off the end of the track", () => {
    assert.equal(fractionOf(-100, 0, 10), 0);
    assert.equal(fractionOf(100, 0, 10), 1);
  });

  test("reading a fraction back gives the value it came from", () => {
    for (const value of [15, 60, 120, 240]) {
      assert.equal(valueAt(fractionOf(value, 15, 240), MINUTES), value);
    }
  });

  test("a fraction between steps snaps to the nearest", () => {
    assert.equal(valueAt(0.5, { min: 0, max: 100, step: 25 }), 50);
    assert.equal(valueAt(0.51, { min: 0, max: 100, step: 25 }), 50);
    assert.equal(valueAt(0.63, { min: 0, max: 100, step: 25 }), 75);
  });
});

describe("what a screen reader says", () => {
  test("minutes under an hour stay minutes", () => {
    assert.equal(spokenDuration(15), "15 minute");
    assert.equal(spokenDuration(45), "45 minute");
  });

  test("whole hours have no minutes tacked on", () => {
    // "o oră și 0 de minute" is what a naive template produces, and it is the
    // kind of thing that makes a listener assume the app is broken.
    assert.equal(spokenDuration(60), "o oră");
    assert.equal(spokenDuration(120), "2 ore");
  });

  test("one hour is singular", () => {
    assert.equal(spokenDuration(90), "o oră și 30 de minute");
    assert.equal(spokenDuration(150), "2 ore și 30 de minute");
  });

  test("a price range says what it means at its bounds", () => {
    /* The upper bound doubles as "no maximum" in the filter sheet. Announcing
       "up to 20 lei" there would have a driver believe they had excluded the
       expensive half of the city. */
    assert.equal(
      spokenPriceRange([0, 20], { unbounded: 20 }),
      "orice preț",
    );
    assert.equal(
      spokenPriceRange([5, 20], { unbounded: 20 }),
      "de la 5 lei în sus",
    );
    assert.equal(
      spokenPriceRange([0, 10], { unbounded: 20 }),
      "de la gratuit până la 10 lei pe oră",
    );
    assert.equal(
      spokenPriceRange([5, 10], { unbounded: 20 }),
      "de la 5 lei până la 10 lei pe oră",
    );
  });
});
