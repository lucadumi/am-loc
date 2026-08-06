/**
 * Tests for the remote half of the live feed: the channel bookkeeping.
 *
 * The local half is covered by `live.test.ts`, which runs with no project
 * configured and never reaches for a channel at all. This file is the other
 * side, and it exists because of a failure that no amount of testing the pure
 * parts could have found: the map going dead on a tab switch.
 *
 * React Navigation fires `blur` on the screen you are leaving before `focus`
 * on the one you are entering. Two screens watching the same topic therefore
 * hand off through a moment where the listener count hits zero — the channel
 * is closed and immediately reopened. Everything about whether that works
 * lives in the ordering of two async functions, so `lib/supabase.ts` is
 * swapped for a fake that reproduces realtime-js's channel reuse and its
 * multi-tick teardown.
 */

import assert from "node:assert/strict";
import { before, beforeEach, describe, test } from "node:test";

import { registerTestLoader } from "./register-loader.ts";

let live: typeof import("../lib/live.ts");
let fakeSupabase: typeof import("./fake-supabase-channels.ts");

/** Let every queued microtask and timer run, the way a real hand-off would. */
const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

before(async () => {
  // A project *is* configured here, which is what sends `watch` down the
  // channel path at all.
  process.env.EXPO_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon-key-for-tests";

  registerTestLoader({ supabase: true });
  live = await import("../lib/live.ts");
  fakeSupabase = await import("./fake-supabase-channels.ts");
});

let opened: (() => void)[] = [];

/** Watch a topic and remember the unsubscribe, so a failed test cannot leak it. */
function watch(topic: "spots" | "reports", onChange: () => void) {
  const stop = live.watch(topic, onChange);
  opened.push(stop);
  return stop;
}

beforeEach(async () => {
  opened.forEach((stop) => stop());
  opened = [];
  await settle();
  fakeSupabase.__reset();
});

describe("handing a topic from one screen to the next", () => {
  test("the screen that focuses does not inherit a channel being torn down", async () => {
    /* The bug this file was written for. Home blurs, its unsubscribe drops the
       channel entry and starts closing; the map focuses in that gap, finds no
       entry, and opens. If the open is allowed to overtake the close it is
       handed the very channel the close is about to destroy, `subscribe()`
       does nothing because that channel is still joined, and the map spends
       the rest of the session subscribed to something torn down — looking
       exactly like a city where nothing is happening. */
    const home = watch("spots", () => {});
    await settle();

    home();
    const map = watch("spots", () => {});
    await settle();

    const live_ = fakeSupabase.__current("amloc:spots");
    assert.ok(live_, "the map must be left with a channel the client still knows");
    assert.equal(live_.torndown, false, "and that channel must not be a torn-down one");
    assert.equal(live_.subscribed, true, "and it must have actually joined");

    map();
    await settle();
  });

  test("the close finishes before the reopen starts, so the channel is a new one", async () => {
    const home = watch("spots", () => {});
    await settle();
    const first = fakeSupabase.created[0];

    home();
    const map = watch("spots", () => {});
    await settle();

    assert.equal(
      fakeSupabase.created.length,
      2,
      "reusing the dying instance is the failure; a second channel is the fix",
    );
    assert.equal(first.torndown, true, "the first is gone");
    assert.notEqual(fakeSupabase.created[1], first, "the second is genuinely a new one");

    map();
    await settle();
  });

  test("a change still reaches the screen that took the topic over", async () => {
    let homeHeard = 0;
    let mapHeard = 0;

    const home = watch("spots", () => {
      homeHeard++;
    });
    await settle();

    home();
    const map = watch("spots", () => {
      mapHeard++;
    });
    await settle();

    /* What the server would send: one change on one published table. The
       topic binds several, and each is a separate subscription. */
    const channel = fakeSupabase.__current("amloc:spots");
    assert.ok(channel);
    assert.ok(channel.bindings.length > 0, "the reopened channel must carry its bindings");
    channel.bindings[0].handler();

    assert.equal(mapHeard, 1, "the screen now watching must be told");
    assert.equal(homeHeard, 0, "the screen that left must not");

    map();
    await settle();
  });

  test("an overlapping hand-off keeps one channel rather than opening a second", async () => {
    // Both screens mounted at once is the ordinary case, and it must not churn
    // the socket: the refcount holds the channel open across the overlap.
    const home = watch("spots", () => {});
    await settle();
    const map = watch("spots", () => {});
    await settle();

    assert.equal(fakeSupabase.created.length, 1, "one topic, one channel");

    home();
    await settle();

    const channel = fakeSupabase.__current("amloc:spots");
    assert.ok(channel, "the remaining screen keeps it open");
    assert.equal(channel.torndown, false);

    map();
    await settle();
    assert.equal(fakeSupabase.created[0].torndown, true, "and the last one out closes it");
  });
});
