/**
 * Tests for lib/bucharest-time.ts.
 *
 * The clock is worth testing on its own because two unrelated features depend
 * on it being right -- what a kerb's regime is, and whether an owner is offering
 * their space -- and because it is the one piece of this app that is wrong twice
 * a year or not at all.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  bucharestDateKey,
  bucharestOffset,
  bucharestTime,
  covers,
  windowState,
  sinceLabel,
} from "../lib/bucharest-time.ts";

const at = (iso: string) => new Date(iso);

describe("bucharestOffset", () => {
  test("winter is UTC+2, summer is UTC+3", () => {
    assert.equal(bucharestOffset(at("2026-01-15T12:00:00Z")), 120);
    assert.equal(bucharestOffset(at("2026-08-05T12:00:00Z")), 180);
  });

  test("the clocks move on the last Sunday of March and October", () => {
    // 2026: 29 March and 25 October, at 01:00 UTC.
    assert.equal(bucharestOffset(at("2026-03-29T00:59:00Z")), 120);
    assert.equal(bucharestOffset(at("2026-03-29T01:00:00Z")), 180);
    assert.equal(bucharestOffset(at("2026-10-25T00:59:00Z")), 180);
    assert.equal(bucharestOffset(at("2026-10-25T01:00:00Z")), 120);
  });

  test("the rule holds in other years, not just the one it was written in", () => {
    // 2027: 28 March and 31 October.
    assert.equal(bucharestOffset(at("2027-03-28T01:00:00Z")), 180);
    assert.equal(bucharestOffset(at("2027-10-31T01:00:00Z")), 120);
  });
});

describe("bucharestTime", () => {
  test("reads the wall clock, not the phone's", () => {
    // The instant a handset set to London would call 16:00.
    const wall = bucharestTime(at("2026-08-05T16:00:00Z"));
    assert.equal(wall.minute, 19 * 60);
    assert.equal(wall.weekday, 3); // Wednesday
  });

  test("an evening instant can belong to the next local day", () => {
    const wall = bucharestTime(at("2026-08-05T22:30:00Z"));
    assert.equal(wall.minute, 90); // 01:30
    assert.equal(wall.weekday, 4); // Thursday, not Wednesday
  });
});


describe("bucharestDateKey", () => {
  test("is the local calendar date, not the UTC one", () => {
    // 22:30 UTC is already tomorrow in Bucharest.
    assert.equal(bucharestDateKey(at("2026-08-05T22:30:00Z")), "2026-08-06");
    assert.equal(bucharestDateKey(at("2026-08-05T10:00:00Z")), "2026-08-05");
  });
});

describe("covers", () => {
  const office = { from: 9 * 60, to: 17 * 60, days: [1, 2, 3, 4, 5] };

  test("an ordinary window is open inside and shut outside", () => {
    assert.equal(covers(office, at("2026-08-05T09:00:00Z")), true); // 12:00 Wed
    assert.equal(covers(office, at("2026-08-05T04:00:00Z")), false); // 07:00 Wed
    assert.equal(covers(office, at("2026-08-05T16:00:00Z")), false); // 19:00 Wed
  });

  test("the weekday list is respected", () => {
    assert.equal(covers(office, at("2026-08-08T09:00:00Z")), false); // Saturday
  });

  test("it opens at `from` and shuts at `to`, not the other way round", () => {
    const noon = { from: 720, to: 780 };
    assert.equal(covers(noon, at("2026-08-05T09:00:00Z")), true); // exactly 12:00
    assert.equal(covers(noon, at("2026-08-05T10:00:00Z")), false); // exactly 13:00
  });

  test("a window past midnight belongs to the day it opened", () => {
    /* Somebody who leaves the space out on Friday evening until Saturday
       morning has described one Friday window. Read as two, the small hours of
       Saturday would either be dropped or credited to Saturday, and a Sunday
       morning nobody offered would open by accident. */
    const overnight = { from: 20 * 60, to: 8 * 60, days: [5] }; // Friday night
    assert.equal(covers(overnight, at("2026-08-07T18:00:00Z")), true); // Fri 21:00
    assert.equal(covers(overnight, at("2026-08-08T02:00:00Z")), true); // Sat 05:00
    assert.equal(covers(overnight, at("2026-08-08T18:00:00Z")), false); // Sat 21:00
    assert.equal(covers(overnight, at("2026-08-09T02:00:00Z")), false); // Sun 05:00
  });
});

describe("windowState", () => {
  test("no windows at all is shut, with nothing promised", () => {
    const state = windowState([], at("2026-08-05T09:00:00Z"));
    assert.equal(state.open, false);
    assert.equal(state.until, undefined);
    assert.equal(state.window, null);
  });

  test("open now, and says when it shuts", () => {
    const state = windowState([{ from: 540, to: 1020 }], at("2026-08-05T09:00:00Z"));
    assert.equal(state.open, true);
    assert.equal(state.until, "2026-08-05T14:00:00.000Z"); // 17:00 local
  });

  test("shut now, and says when it opens", () => {
    const state = windowState([{ from: 540, to: 1020 }], at("2026-08-05T16:00:00Z"));
    assert.equal(state.open, false);
    assert.equal(state.until, "2026-08-06T06:00:00.000Z"); // 09:00 local tomorrow
  });

  test("overlapping windows are one unbroken stretch", () => {
    /* The reason the state is asked rather than walked. Someone offering
       09:00-13:00 and 12:00-17:00 is offering the whole afternoon. Taking the
       next edge in time would announce that it ends at one o'clock, which is a
       promise the app would then break in front of the driver. */
    const state = windowState(
      [
        { from: 9 * 60, to: 13 * 60 },
        { from: 12 * 60, to: 17 * 60 },
      ],
      at("2026-08-05T07:30:00Z"), // 10:30 local
    );
    assert.equal(state.open, true);
    assert.equal(state.until, "2026-08-05T14:00:00.000Z"); // 17:00, not 13:00
  });

  test("a gap between two windows is a real gap", () => {
    const windows = [
      { from: 8 * 60, to: 10 * 60 },
      { from: 14 * 60, to: 16 * 60 },
    ];
    const inGap = windowState(windows, at("2026-08-05T09:00:00Z")); // 12:00
    assert.equal(inGap.open, false);
    assert.equal(inGap.until, "2026-08-05T11:00:00.000Z"); // 14:00 local
  });

  test("which window is open is reported, so it can be attributed", () => {
    const morning = { from: 8 * 60, to: 10 * 60 };
    const evening = { from: 18 * 60, to: 20 * 60 };
    const state = windowState([morning, evening], at("2026-08-05T16:00:00Z")); // 19:00
    assert.equal(state.window, evening);
  });

  test("the wall clock holds across the clocks going back", () => {
    // 09:00-17:00 local must still be 09:00-17:00 in winter, not 08:00-16:00.
    const windows = [{ from: 540, to: 1020 }];
    assert.equal(covers(windows[0], at("2026-01-15T07:30:00Z")), true); // 09:30 EET
    assert.equal(covers(windows[0], at("2026-01-15T06:30:00Z")), false); // 08:30 EET
  });
});

describe("how long ago, in words", () => {
  const at = (iso: string) => new Date(iso);
  const NOW = at("2026-08-15T12:00:00Z");

  test("the last minute is just 'acum'", () => {
    assert.equal(sinceLabel("2026-08-15T11:59:30Z", NOW), "acum");
  });

  test("a clock running fast does not produce a negative duration", () => {
    // A device a few seconds ahead of the server is ordinary, and "acum -1
    // minute" is how it would read.
    assert.equal(sinceLabel("2026-08-15T12:00:30Z", NOW), "acum");
  });

  test("minutes, hours and days", () => {
    assert.equal(sinceLabel("2026-08-15T11:45:00Z", NOW), "acum 15 minute");
    assert.equal(sinceLabel("2026-08-15T09:00:00Z", NOW), "acum 3 ore");
    assert.equal(sinceLabel("2026-08-12T12:00:00Z", NOW), "acum 3 zile");
  });

  test("one is singular", () => {
    assert.equal(sinceLabel("2026-08-15T11:59:00Z", NOW), "acum 1 minut");
    assert.equal(sinceLabel("2026-08-15T11:00:00Z", NOW), "acum 1 oră");
    assert.equal(sinceLabel("2026-08-14T12:00:00Z", NOW), "acum 1 zi");
  });

  test("twenty and up take 'de'", () => {
    /* Romanian's third agreement class, and the one everybody misses: "3
       minute" but "20 de minute". Getting it wrong does not read as a bug, it
       reads as an app written by somebody who does not speak the language. */
    assert.equal(sinceLabel("2026-08-15T11:40:00Z", NOW), "acum 20 de minute");
    assert.equal(sinceLabel("2026-08-15T11:15:00Z", NOW), "acum 45 de minute");
  });

  test("nineteen does not", () => {
    assert.equal(sinceLabel("2026-08-15T11:41:00Z", NOW), "acum 19 minute");
  });

  test("past a week it becomes a date", () => {
    // "acum 23 de zile" is a number somebody has to convert, and a date is the
    // thing they were converting it to.
    assert.match(sinceLabel("2026-07-20T12:00:00Z", NOW), /iul/i);
  });

  test("a date in another year says which", () => {
    assert.match(sinceLabel("2025-07-20T12:00:00Z", NOW), /2025/);
  });
});
