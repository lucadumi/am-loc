/**
 * Tests for the live feed's local half.
 *
 * Only the local half: the remote half — the Supabase channel and the
 * subscribe/teardown ordering around it — is covered by `live-channels.test.ts`,
 * which configures a project and swaps in a fake client. This file runs with no
 * project at all, so `watch` never reaches for a channel and what is left is
 * the in-memory bookkeeping: who gets told, what happens when a listener
 * throws, whether unsubscribing actually stops the flow. A bug there would be
 * invisible rather than loud. A leaked listener does not crash anything. It
 * keeps a screen that was closed refetching for the rest of the session.
 */

import assert from "node:assert/strict";
import { before, beforeEach, describe, test } from "node:test";

import { registerTestLoader } from "./register-loader.ts";

let live: typeof import("../lib/live.ts");

before(async () => {
  // No project configured, so `watch` stays entirely in memory and never
  // reaches for @supabase/supabase-js.
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  registerTestLoader();
  live = await import("../lib/live.ts");
});

/** Collects a topic's notifications until it is stopped. */
function counter(topic: "spots" | "reports") {
  const state = { count: 0, stop: () => {} };
  state.stop = live.watch(topic, () => {
    state.count++;
  });
  return state;
}

let opened: { stop: () => void }[] = [];

beforeEach(() => {
  opened.forEach((watcher) => watcher.stop());
  opened = [];
});

describe("who hears about a change", () => {
  test("a watcher is told", () => {
    const spots = counter("spots");
    opened.push(spots);

    live.publish("spots");

    assert.equal(spots.count, 1);
  });

  test("every watcher of the topic is told, once each", () => {
    const first = counter("spots");
    const second = counter("spots");
    opened.push(first, second);

    live.publish("spots");

    assert.equal(first.count, 1);
    assert.equal(second.count, 1);
  });

  test("watchers of another topic are left alone", () => {
    const spots = counter("spots");
    const reports = counter("reports");
    opened.push(spots, reports);

    live.publish("reports");

    assert.equal(spots.count, 0);
    assert.equal(reports.count, 1);
  });

  test("publishing to nobody is not an error", () => {
    assert.doesNotThrow(() => live.publish("spots"));
  });
});

describe("stopping", () => {
  test("an unsubscribed watcher hears nothing further", () => {
    const spots = counter("spots");

    live.publish("spots");
    spots.stop();
    live.publish("spots");

    assert.equal(spots.count, 1);
  });

  test("stopping twice is harmless", () => {
    const spots = counter("spots");

    spots.stop();
    spots.stop();

    assert.doesNotThrow(() => live.publish("spots"));
  });

  test("one screen leaving does not silence the others", () => {
    const staying = counter("spots");
    const leaving = counter("spots");
    opened.push(staying);

    leaving.stop();
    live.publish("spots");

    assert.equal(staying.count, 1);
    assert.equal(leaving.count, 0);
  });
});

describe("a listener that misbehaves", () => {
  test("does not stop the others being told", () => {
    const stop = live.watch("spots", () => {
      throw new Error("this screen is broken");
    });
    const healthy = counter("spots");
    opened.push(healthy);

    live.publish("spots");

    stop();
    assert.equal(healthy.count, 1);
  });

  test("can unsubscribe itself while being told", () => {
    // Iterating the live set would skip whoever came next.
    let stopSelf = () => {};
    stopSelf = live.watch("spots", () => stopSelf());
    const after = counter("spots");
    opened.push(after);

    live.publish("spots");

    assert.equal(after.count, 1);
  });
});
