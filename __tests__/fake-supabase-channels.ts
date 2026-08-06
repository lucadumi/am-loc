/**
 * A stand-in for `lib/supabase.ts` that reproduces the one realtime-js
 * behaviour the channel bookkeeping in `lib/live.ts` has to survive.
 *
 * That behaviour is channel *reuse*: `RealtimeClient.channel(topic)` returns
 * the instance it already holds for that topic rather than a fresh one, and it
 * goes on holding it until `removeChannel` has finished unsubscribing. So an
 * open that starts before a close has finished is handed the channel that is
 * about to be torn down — and because `subscribe()` only does anything on a
 * closed channel, it rejoins nothing and fails silently.
 *
 * The asynchrony matters as much as the reuse, so `removeChannel` tears down
 * over several microtasks the way the real one does. A synchronous fake would
 * make the race untestable by making it impossible.
 */

export type FakeChannel = {
  topic: string;
  bindings: { table: string; handler: () => void }[];
  subscribed: boolean;
  torndown: boolean;
  on: (
    type: string,
    filter: { event: string; schema: string; table: string },
    handler: () => void,
  ) => FakeChannel;
  subscribe: (onStatus?: (status: string, error?: Error) => void) => FakeChannel;
};

/** Every channel ever handed out, in creation order. */
export const created: FakeChannel[] = [];

/** The channels the client currently knows about, by topic. */
const registry = new Map<string, FakeChannel>();

function makeChannel(topic: string): FakeChannel {
  const channel: FakeChannel = {
    topic,
    bindings: [],
    subscribed: false,
    torndown: false,
    on(_type, filter, handler) {
      channel.bindings.push({ table: filter.table, handler });
      return channel;
    },
    subscribe(onStatus) {
      // The real one only joins from a closed state; a joined or leaving
      // channel silently ignores the call, which is the whole trap.
      if (!channel.torndown && !channel.subscribed) {
        channel.subscribed = true;
        onStatus?.("SUBSCRIBED");
      }
      return channel;
    },
  };
  return channel;
}

const client = {
  channel(topic: string): FakeChannel {
    const existing = registry.get(topic);
    if (existing) return existing;
    const channel = makeChannel(topic);
    registry.set(topic, channel);
    created.push(channel);
    return channel;
  },
  async removeChannel(channel: FakeChannel): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    channel.subscribed = false;
    channel.torndown = true;
    if (registry.get(channel.topic) === channel) registry.delete(channel.topic);
  },
};

export function supabase() {
  return client;
}

/** Forget everything, so one test cannot see another's channels. */
export function __reset() {
  created.length = 0;
  registry.clear();
}

/** The channel the client would hand out for a topic right now, if any. */
export function __current(topic: string): FakeChannel | undefined {
  return registry.get(topic);
}
