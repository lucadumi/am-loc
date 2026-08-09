/**
 * Availability windows: when an owner is offering their own parking space.
 *
 * The storage half of lib/private-spots.ts, and the deliberate counterpart to
 * the status reports the app used to keep. Both persist what somebody said
 * difference is who is allowed to say it and what happens to it afterwards.
 *
 * A status report is evidence and is append-only, because a newer claim has to
 * outweigh an older one rather than erase it -- that is what lets a public kerb
 * be contested instead of flipping to whoever spoke last.
 *
 * A window is not evidence. It is a decision by the one person entitled to make
 * it, and decisions get changed: an owner whose plans move must be able to
 * withdraw Tuesday afternoon, not file a correction that argues with their
 * earlier self. So windows are mutable and deletable, and only ever by their
 * owner. That is enforced in Postgres by row level security rather than here,
 * because a rule a client enforces is a rule an attacker skips.
 *
 * Reads and writes go to Supabase when a project is configured and to on-device
 * storage when it is not, so a fresh clone runs the whole flow with no
 * credentials.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { AvailabilityWindow } from "@/types";

import { publish } from "./live.ts";
import { isRemote } from "./remote.ts";

const WINDOWS_KEY = "amloc.availability-windows.v1";

/**
 * Only what this device has written.
 *
 * Every write goes through this rather than through `loadWindows`, so that the
 * remote branch cannot be persisted to local storage by accident.
 */
async function loadStored(): Promise<AvailabilityWindow[]> {
  const raw = await AsyncStorage.getItem(WINDOWS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/** Every window the app knows about: the project's, or this device's. */
export async function loadWindows(): Promise<AvailabilityWindow[]> {
  if (isRemote()) {
    const { fetchAvailabilityWindows } = await import("./supabase-data.ts");
    return fetchAvailabilityWindows();
  }
  /* Only what this device has actually offered. There are no seeded windows:
     an invented offer is a stranger's garage that does not exist, and the one
     thing worse than an empty park-sharing list is one full of spaces a driver
     cannot be given. An owner who lists their own spot sees it here at once. */
  return loadStored();
}

const WITHDRAWN_KEY = "amloc.availability-withdrawn.v1";

/**
 * Forget the tombstones an earlier build kept for withdrawn seeded windows.
 *
 * There are no seeded windows any more, so the key is dead weight on a device
 * that upgraded. Cleared rather than left alone because it is a list of ids
 * nothing will ever consult again, and a stale key is how the next person
 * reading this file concludes the mechanism is still live.
 */
async function forgetWithdrawnSeeds(): Promise<void> {
  await AsyncStorage.removeItem(WITHDRAWN_KEY);
}

/** Windows grouped by spot, so a list can look them up in one pass. */
export function groupBySpot(
  windows: AvailabilityWindow[],
): Map<string, AvailabilityWindow[]> {
  const bySpot = new Map<string, AvailabilityWindow[]>();
  for (const window of windows) {
    const existing = bySpot.get(window.spotId);
    if (existing) existing.push(window);
    else bySpot.set(window.spotId, [window]);
  }
  return bySpot;
}

/** Every window for one spot. */
export async function windowsFor(spotId: string): Promise<AvailabilityWindow[]> {
  return (await loadWindows()).filter((window) => window.spotId === spotId);
}

/** The map `withOffers` needs to answer a whole screen in one read. */
export async function loadWindowsBySpot(): Promise<
  Map<string, AvailabilityWindow[]>
> {
  return groupBySpot(await loadWindows());
}

function newWindowId(): string {
  return `w_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Offer a stretch of time. Returns the stored window. */
export async function addWindow(
  input: Omit<AvailabilityWindow, "id">,
): Promise<AvailabilityWindow> {
  const window: AvailabilityWindow = { ...input, id: newWindowId() };
  if (isRemote()) {
    const { insertAvailabilityWindow } = await import("./supabase-data.ts");
    await insertAvailabilityWindow(window);
    publish("spots");
    return window;
  }
  const stored = await loadStored();
  await AsyncStorage.setItem(WINDOWS_KEY, JSON.stringify([window, ...stored]));
  publish("spots");
  return window;
}

/**
 * Withdraw a window.
 *
 * Deletes rather than marking it ended, because an owner taking their space
 * back is not a historical fact anybody needs: nothing in this app is built on
 * a record of offers that were later cancelled, and keeping them would leave the
 * owner's own list full of things they had already said no to.
 */
export async function removeWindow(id: string): Promise<void> {
  if (isRemote()) {
    const { deleteAvailabilityWindow } = await import("./supabase-data.ts");
    await deleteAvailabilityWindow(id);
    publish("spots");
    return;
  }
  const stored = await loadStored();
  await AsyncStorage.setItem(
    WINDOWS_KEY,
    JSON.stringify(stored.filter((window) => window.id !== id)),
  );
  await forgetWithdrawnSeeds();
  publish("spots");
}
