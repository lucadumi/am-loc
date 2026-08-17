/**
 * Where the driver left the car.
 *
 * The smallest table in the project and the one that needed the most argument
 * before it was written, because a dated list of where somebody parks is where
 * they sleep and where they work, over months. Everything about this module is
 * shaped by that: nobody else can read a row, nothing else in the app consults
 * one, and the driver can delete any of them at any time.
 *
 * WHAT IT IS NOT. Not a reservation -- nothing is held for anybody. Not a
 * claim that the place is now full: a public car park's occupancy is a fact
 * somebody would have to count, and one driver saying they parked is not that
 * count. The map is exactly as it was before the tap. It is a note to self,
 * and treating it as evidence about the city would be inventing a survey out
 * of a private memory.
 *
 * WHY THE TITLE IS COPIED IN. Half the map is bundled in the client -- the
 * OpenStreetMap and CMPB car parks in `constants/` -- and exists as a row only
 * where `scripts/import-parking.mjs` has been run against the project. Storing
 * the id alone would give a history that renders blank for most of the places
 * people actually park in. See the `parkings` section of `0012`.
 *
 * Reads and writes go to Supabase when a project is configured and to
 * on-device storage when it is not, like every other write in this app, so a
 * fresh clone runs the whole flow with no credentials.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Parking, ParkingSpot } from "@/types";

import { publish } from "./live.ts";
import { isRemote } from "./remote.ts";

const PARKINGS_KEY = "amloc.parkings.v1";

/** Newest first. The only order this list is ever wanted in. */
export function byNewest(a: Parking, b: Parking): number {
  return b.at.localeCompare(a.at);
}

/**
 * What a parking looks like the moment it is made.
 *
 * Pure, and separate from the writing, so the shape can be checked without a
 * device: the title snapshot is the part worth a test, because a spot with no
 * title at all is an imported car park and the field has to stay absent rather
 * than becoming the string "undefined" in somebody's history.
 */
export function parkingAt(
  spot: Pick<ParkingSpot, "id" | "title">,
  at: Date = new Date(),
): Parking {
  return {
    id: `p_${at.getTime()}_${Math.random().toString(36).slice(2, 6)}`,
    spotId: spot.id,
    spotTitle: spot.title?.trim() ? spot.title : undefined,
    at: at.toISOString(),
  };
}

/** Only what this device has written. Every local write goes through it. */
async function loadStored(): Promise<Parking[]> {
  const raw = await AsyncStorage.getItem(PARKINGS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/** Every parking this driver has recorded, newest first. */
export async function loadParkings(): Promise<Parking[]> {
  if (isRemote()) {
    const { fetchParkings } = await import("./supabase-data.ts");
    return fetchParkings();
  }
  return (await loadStored()).sort(byNewest);
}

/** The last one, for the home screen. Undefined when there is none. */
export async function lastParking(): Promise<Parking | undefined> {
  return (await loadParkings())[0];
}

/**
 * Write down that the car is here.
 *
 * Returns what was stored rather than nothing, because with a project the
 * database decides the id and the moment, and a screen that kept its own guess
 * would show a duplicate the first time the list reloaded.
 */
export async function recordParking(
  spot: Pick<ParkingSpot, "id" | "title">,
): Promise<Parking> {
  const parking = parkingAt(spot);
  if (isRemote()) {
    const { insertParking } = await import("./supabase-data.ts");
    const stored = await insertParking(parking);
    publish("spots");
    return stored;
  }
  const kept = await loadStored();
  await AsyncStorage.setItem(PARKINGS_KEY, JSON.stringify([parking, ...kept]));
  publish("spots");
  return parking;
}

/**
 * Forget one.
 *
 * Deleted rather than marked, and without a trace, which is the opposite of
 * how a report behaves. A complaint is evidence other people rely on; this is
 * a private note, and a history that cannot be pruned is a history somebody
 * learns not to write in the first place.
 */
export async function forgetParking(id: string): Promise<void> {
  if (isRemote()) {
    const { deleteParking } = await import("./supabase-data.ts");
    await deleteParking(id);
    publish("spots");
    return;
  }
  const kept = await loadStored();
  await AsyncStorage.setItem(
    PARKINGS_KEY,
    JSON.stringify(kept.filter((parking) => parking.id !== id)),
  );
  publish("spots");
}
