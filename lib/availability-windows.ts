/**
 * Availability windows: when an owner is offering their own parking space.
 *
 * The storage half of lib/private-spots.ts, and the deliberate counterpart to
 * lib/spot-reports.ts. Both persist what somebody said about a spot; the
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
 * Windows for the seeded private spots, so the flow is visible on a fresh
 * clone with no backend and nothing yet in storage.
 *
 * The two describe the two cases worth seeing. One is an owner lending their
 * garage for free while they are at work, which is the ordinary weekday
 * pattern. The other is somebody letting their space overnight for money, which
 * exercises the window that runs past midnight and the price that rides on the
 * window rather than on the spot.
 *
 * Not mixed into remote results, for the same reason `SEED_SPOTS` are not: with
 * a project configured these are somebody's real listings, and inventing extra
 * ones would be offering a stranger's garage that does not exist.
 */
export const SEED_WINDOWS: AvailabilityWindow[] = [
  {
    id: "w_seed_workday",
    spotId: "p_floreasca_garaj",
    from: 9 * 60,
    to: 17 * 60,
    days: [1, 2, 3, 4, 5],
    note: "Poarta e pe lateral, cod 1974.",
  },
  {
    id: "w_seed_overnight",
    spotId: "p_dorobanti_loc",
    from: 19 * 60,
    to: 7 * 60,
    pricePerHour: 8,
    note: "Doar peste noapte, plec la 7 dimineața.",
  },
];

/**
 * Only what this device has written, without the seeds.
 *
 * Every write goes through this rather than through `loadWindows`, because
 * writing back a list that had the seeds folded into it would persist them, and
 * the next read would fold them in again on top. One duplicate per launch, and
 * the owner's screen slowly fills with copies of the same offer.
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
  /* Seeds are kept alongside what this device has written, minus any the owner
     has since withdrawn. Without the tombstone check, removing a seeded window
     would appear to work and then have it return on the next read, which is the
     most confusing possible outcome for a control whose entire job is taking
     the offer back. */
  const [stored, withdrawn] = await Promise.all([loadStored(), loadWithdrawn()]);
  return [...stored, ...SEED_WINDOWS.filter((seed) => !withdrawn.includes(seed.id))];
}

const WITHDRAWN_KEY = "amloc.availability-withdrawn.v1";

/** Ids of seeded windows the owner has removed on this device. */
async function loadWithdrawn(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(WITHDRAWN_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
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

/** The map `believeAll` needs to answer a whole screen in one read. */
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
  // A seeded window lives in the source, not in storage, so there is no row to
  // delete; it is remembered as withdrawn instead.
  if (SEED_WINDOWS.some((seed) => seed.id === id)) {
    const withdrawn = await loadWithdrawn();
    await AsyncStorage.setItem(
      WITHDRAWN_KEY,
      JSON.stringify([...new Set([...withdrawn, id])]),
    );
  }
  publish("spots");
}
