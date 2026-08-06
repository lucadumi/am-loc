/**
 * Watching the city change while you are looking at it.
 *
 * A screen that reloads only when it is focused is not a live map. It leaves a
 * driver staring at the map while somebody two streets away announces a space
 * seeing nothing at all, and a driver acting on a kerb taken thirty seconds
 * earlier driving to it anyway. For a map whose entire value is that it is
 * more current than the street, a refresh that only happens when you leave the
 * screen and come back is the wrong shape.
 *
 * One API covers both halves of the app's split personality. Writes made on
 * this device publish here, so the no-backend build is live too and the
 * announcer's own map updates in the same frame rather than after a round
 * trip. With a project configured, a Postgres change feed publishes the same
 * topics, so a screen subscribes once and never has to know which world it is
 * in — which is the same bargain `lib/api.ts` and `lib/remote.ts` already
 * strike everywhere else.
 *
 * Topics rather than tables, deliberately. A screen wants to know that "the
 * spots changed", not that a row landed in `status_reports`; keeping the
 * mapping here is what stops every caller from having to learn the schema.
 */

import type { RealtimeChannel } from "@supabase/supabase-js";

import { isRemote } from "./remote.ts";

/** What a screen can care about. */
export type Topic = "spots" | "reports";

/** Which tables make a topic stale. */
const TABLES: Record<Topic, string[]> = {
  spots: ["spots", "status_reports"],
  reports: ["reports", "report_events"],
};

type Listener = () => void;

const listeners: Record<Topic, Set<Listener>> = {
  spots: new Set(),
  reports: new Set(),
};

/**
 * Open channels, keyed by topic and refcounted by the listener sets above.
 *
 * A promise rather than a channel, because opening one means loading
 * `lib/supabase.ts` — and therefore `@supabase/supabase-js` — which must not
 * happen on a device with no project. Storing the promise is also what keeps
 * two screens mounting at once from opening two sockets for one topic.
 */
const channels = new Map<Topic, Promise<RealtimeChannel | null>>();

/**
 * The last piece of lifecycle work queued for a topic, open or close.
 *
 * Opening and closing one topic must never overlap, and left to themselves
 * they do. Unsubscribing drops the entry from `channels` and then closes
 * asynchronously; a screen focusing in that gap finds no entry and opens a new
 * channel — but `client.channel(topic)` hands back the *existing* instance for
 * a topic the client still knows about, so the reopen received the very
 * channel the close was about to tear down. Its `subscribe()` was a no-op
 * because the channel was still joined, and moments later `removeChannel`
 * wiped the bindings.
 *
 * Which is Home -> Hartă: blur fires before focus, so the single most common
 * navigation in the app left the map holding a dead channel and quietly back
 * on refresh-on-focus. Serialising the two makes the close finish first, so
 * the client has genuinely forgotten the topic before the next open asks.
 */
const lifecycle = new Map<Topic, Promise<unknown>>();

function serialize<T>(topic: Topic, work: () => Promise<T>): Promise<T> {
  const previous = lifecycle.get(topic) ?? Promise.resolve();
  // `then(work, work)` rather than `.then(work)`: a failed close must not
  // strand every later open for that topic behind a rejected promise.
  const next = previous.then(work, work);
  lifecycle.set(
    topic,
    next.catch(() => undefined),
  );
  return next;
}

async function openChannel(topic: Topic): Promise<RealtimeChannel | null> {
  const { supabase } = await import("./supabase.ts");
  const client = supabase();
  if (!client) return null;

  const channel = client.channel(`amloc:${topic}`);
  for (const table of TABLES[topic]) {
    // The payload is thrown away on purpose. Applying a diff by hand would
    // mean a second implementation of the flattening in `supabase-rows.ts`
    // and of the belief model on top of it, and the two would drift. Refetching
    // is one query against a table small enough to fit in a phone.
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      () => publish(topic),
    );
  }
  /* 0003 says the worst failure here is the one that reports success: a client
     that subscribes happily and receives nothing looks exactly like a quiet
     city. Without this callback that is every failure — a missing publication,
     an RLS policy that refuses, a binding mismatch — so the one signal the
     server sends about any of them is at least written down. */
  channel.subscribe((status, error) => {
    if (status === "SUBSCRIBED" || status === "CLOSED") return;
    console.error(`The ${topic} channel is ${status}`, error);
  });
  return channel;
}

async function closeChannel(pending: Promise<RealtimeChannel | null>) {
  const channel = await pending;
  if (!channel) return;
  const { supabase } = await import("./supabase.ts");
  await supabase()?.removeChannel(channel);
}

/**
 * Say that something under a topic changed here.
 *
 * Called after every local write, including the ones that also went to the
 * server. The echo will arrive over the channel a moment later and be
 * collapsed by the caller's debounce; what this buys is that the driver who
 * just announced a spot sees their own map update immediately, rather than
 * watching a spinner wait for the network to tell them what they already know.
 */
export function publish(topic: Topic): void {
  // A copy, so a listener that unsubscribes itself while being notified does
  // not modify the set being iterated.
  for (const listener of [...listeners[topic]]) {
    try {
      listener();
    } catch (error) {
      // One screen failing to refresh must not stop the others.
      console.error(`A ${topic} listener threw`, error);
    }
  }
}

/** Watch a topic. Returns the unsubscribe, which also closes the channel. */
export function watch(topic: Topic, onChange: Listener): () => void {
  listeners[topic].add(onChange);

  if (isRemote() && !channels.has(topic)) {
    channels.set(
      topic,
      serialize(topic, () => openChannel(topic)).catch((error) => {
        // A map that stops refreshing on focus because the socket failed is
        // worse than one that was never live: the screens keep their own
        // reload, so this is degradation rather than breakage.
        console.error(`Could not watch ${topic}`, error);
        return null;
      }),
    );
  }

  return () => {
    listeners[topic].delete(onChange);
    if (listeners[topic].size) return;
    const pending = channels.get(topic);
    if (!pending) return;
    channels.delete(topic);
    serialize(topic, () => closeChannel(pending)).catch((error) =>
      console.error(`Could not stop watching ${topic}`, error),
    );
  };
}
