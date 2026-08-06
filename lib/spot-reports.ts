/**
 * Status reports: the observations a spot's belief is actually built from.
 *
 * Not to be confused with `BlockerReport` in `lib/api.ts`, which is a civic
 * complaint about a car parked on a pavement. These are the ordinary claims
 * that drive the map: someone saw a spot, and said what they saw.
 *
 * This exists so the belief model can do the thing it is written for.
 * `believe()` weighs several claims against each other, resolves disagreement
 * and reports how close the vote was — all of which needs more than one claim
 * per spot. Reconstructing a single report from a spot's flattened `status`
 * and `updatedAt` would make every spot unanimous by construction: `contested`
 * always false, `margin` always exactly 1, and the entire conflict-resolution
 * path dead code in practice.
 *
 * With reports stored as rows, a second driver can contradict the first, and
 * the model earns its keep.
 *
 * Reads and writes go to Supabase when a project is configured and to
 * on-device storage when it is not, which is what lets a fresh clone run with
 * no credentials. The two paths return the same `SpotReport`, so nothing above
 * this module can tell them apart.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ParkingSpot, SpotStatus } from "@/types";

import { publish } from "./live.ts";
import { mayReport } from "./private-spots.ts";
import { isRemote } from "./remote.ts";
import type { SpotReport } from "./spot-state.ts";

const STATUS_REPORTS_KEY = "amloc.status-reports.v1";

/** Who the app is reporting as until there are accounts. */
export const LOCAL_REPORTER_ID = "me";

/** Every status report worth weighing: the project's, or this device's. */
export async function loadReports(): Promise<SpotReport[]> {
  if (isRemote()) {
    const { fetchStatusReports } = await import("./supabase-data.ts");
    return fetchStatusReports();
  }
  const raw = await AsyncStorage.getItem(STATUS_REPORTS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * File a report about a spot. Returns the stored row.
 *
 * Takes the spot rather than its id, and that is the whole guard. A caller who
 * only has an id cannot answer the question this function has to ask -- may
 * anybody speak about this? -- and would have had to be trusted to remember it.
 * Asking for the spot makes forgetting a type error.
 *
 * A private spot is described by its owner through availability windows, never
 * by observation, so a report about one is refused here and refused again by a
 * trigger in Postgres. Two copies of the same rule, because the client's copy
 * gives a decent error and the database's is the one that actually holds.
 */
export async function addStatusReport(input: {
  spot: Pick<ParkingSpot, "id" | "access">;
  status: SpotStatus;
  reporterId?: string;
  leavingInMin?: number;
  spaces?: number;
}): Promise<SpotReport> {
  if (!mayReport(input.spot)) {
    throw new Error(
      "Un loc privat e descris de proprietarul lui, nu raportat de altcineva",
    );
  }
  const spotId = input.spot.id;

  if (isRemote()) {
    const { insertStatusReport } = await import("./supabase-data.ts");
    // No local reporter id is passed on: the server writes the report as
    // `auth.uid()` and would reject anything else.
    const filed = await insertStatusReport({
      spotId,
      status: input.status,
      leavingInMin: input.leavingInMin,
      spaces: input.spaces,
    });
    publish("spots");
    return filed;
  }

  const report: SpotReport = {
    spotId,
    status: input.status,
    at: new Date().toISOString(),
    reporterId: input.reporterId ?? LOCAL_REPORTER_ID,
    leavingInMin: input.leavingInMin,
    spaces: input.spaces,
  };
  const stored = await loadReports();
  await AsyncStorage.setItem(STATUS_REPORTS_KEY, JSON.stringify([report, ...stored]));
  publish("spots");
  return report;
}

/**
 * Group stored reports by spot, so a screen can look them up in one pass
 * rather than filtering the whole list per row.
 */
export function groupBySpot(reports: SpotReport[]): Map<string, SpotReport[]> {
  const bySpot = new Map<string, SpotReport[]>();
  for (const report of reports) {
    const existing = bySpot.get(report.spotId);
    if (existing) existing.push(report);
    else bySpot.set(report.spotId, [report]);
  }
  return bySpot;
}

/**
 * The seed claim carried by a spot's own fields.
 *
 * The fixtures predate reports being rows, and each carries exactly one
 * flattened observation. Reading it back as a report keeps that history in
 * play rather than discarding it the moment a second driver speaks up: a
 * community map that forgets everything older than the current session is
 * worse than one that remembers and discounts.
 */
export function seedReport(spot: ParkingSpot): SpotReport {
  return {
    spotId: spot.id,
    status: spot.status,
    at: spot.updatedAt,
    reporterId: spot.reportedBy ?? `anon:${spot.id}`,
    leavingInMin: spot.leavingInMin,
  };
}

export async function clearStatusReports(): Promise<void> {
  await AsyncStorage.removeItem(STATUS_REPORTS_KEY);
}
