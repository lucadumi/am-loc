import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";

import { watch, type Topic } from "@/lib/live";

/**
 * How long to wait for the flurry to end before reloading.
 *
 * Announcing a spot writes twice, and a busy street can produce several claims
 * in a second. Reloading on each one would refetch the whole map three times
 * to show one change; waiting a beat collapses that into a single query while
 * staying far below the threshold where a person would call the map slow.
 */
const SETTLE_MS = 400;

/**
 * Reload while the screen is on show, whenever the topic changes anywhere.
 *
 * Focus-scoped rather than mount-scoped, because a tab screen mounts once and
 * then stays mounted for the life of the app: a subscription tied to mounting
 * would keep every tab refetching in the background forever, and a phone in a
 * pocket would burn through data updating maps nobody is looking at.
 */
export function useLive(topic: Topic, reload: () => void): void {
  // The callback is read at the moment a change arrives rather than captured
  // when the subscription was made, so a screen may pass a fresh closure on
  // every render without tearing the channel down and building it again.
  const latest = useRef(reload);
  useEffect(() => {
    latest.current = reload;
  });

  useFocusEffect(
    useCallback(() => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const stop = watch(topic, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => latest.current(), SETTLE_MS);
      });
      return () => {
        if (timer) clearTimeout(timer);
        stop();
      };
    }, [topic]),
  );
}
