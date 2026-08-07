import AsyncStorage from "@react-native-async-storage/async-storage";

import { CMPB_PARKING } from "@/constants/cmpb-parking.ts";
import { PUBLIC_PARKING } from "@/constants/public-parking.ts";
import { distanceMeters, etaMinutes, type LatLng } from "@/lib/geo.ts";
import { currentIdentity, resolveIdentity } from "@/lib/identity.ts";
import { publish } from "@/lib/live.ts";
import { isRemote } from "@/lib/remote.ts";
import { LOCAL_REPORTER_ID } from "@/lib/spot-reports.ts";
// `import type`, not a plain import: `@/types` is types only, so a value
// import of it survives Node's type stripping and asks for exports that do not
// exist at runtime. That is the difference between this module being covered
// by the unit tests and not being loadable outside the bundler at all.
import type {
  BlockerReport,
  ParkingSpot,
  ReportResolution,
  ReportStatus,
} from "@/types";

/**
 * The app's data layer.
 *
 * Spots and the claims made about them come from Supabase when a project is
 * configured (see `.env.example`), and from the imported layers below when one
 * is not, so a fresh clone with no credentials still opens on a real map of
 * Bucharest. Blocker reports go the same way now that the schema models them.
 *
 * THERE IS NO INVENTED DATA HERE, and there is not going to be. Every car park
 * the app draws is a real one: `PUBLIC_PARKING` is OpenStreetMap, `CMPB_PARKING`
 * is the municipal blue zone as its operator publishes it. Both carry `source`
 * fields that mark them as records rather than observations, so nothing in
 * either pretends anybody has looked at a space -- they read "Fără raportări"
 * until a driver files a claim.
 *
 * That matters more than it sounds. A stand-in kerb is indistinguishable, on
 * screen, from a real one somebody just checked, and the app's single promise
 * is that what it shows is true. A map with a plausible fiction in it is worse
 * than an empty one, because the driver cannot tell which part to trust.
 */

const REPORTS_KEY = "amloc.reports.v1";
const REPORT_STATUS_KEY = "amloc.report-status.v1";

/**
 * Every car park the app knows about without asking anybody: the blue zone
 * first, then whatever OpenStreetMap has that CMPB does not.
 *
 * Two sources because they answer different questions. CMPB knows every space
 * it operates, how many bays it has and what it charges, and nothing about a
 * car park it does not run. OSM knows about the free kerbs, the mall garages
 * and the private ones, and carries almost no tariffs. Neither alone is a map
 * of Bucharest.
 *
 * They are concatenated rather than merged by position: a CMPB lot and an OSM
 * car park at the same corner are usually the same asphalt, but the ids come
 * from different registries and matching them by distance would be a guess. It
 * is a real duplicate on the map and it is the honest kind -- both entries are
 * true, from different registries, and neither invents a space.
 */
const IMPORTED_PARKING: ParkingSpot[] = [...CMPB_PARKING, ...PUBLIC_PARKING];

/**
 * An id for something this device is about to file.
 *
 * The millisecond alone was enough while everything stayed on one phone. It is
 * not enough now that spots and reports are rows in a table two drivers write
 * to at once: `spots.id` and `reports.id` are primary keys, and two phones
 * filing in the same millisecond would have one of them rejected — most likely
 * the second driver to photograph the same blocked pavement, in the same
 * minute, for the same reason.
 */
function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Blocker reports filed from this device, newest first. Corrupt reads as none.
 *
 * Two shapes from before are folded in on the way out. A report filed when a
 * report could hold one photograph carries `photoUri`, and one filed before
 * reports had authors carries none: it was written on this device, by this
 * driver, so it is theirs. Dropping either would quietly take something off a
 * report somebody already filed, and the photograph in particular is the one
 * part of it nobody can reconstruct afterwards.
 */
async function loadStoredReports(): Promise<BlockerReport[]> {
  const raw = await AsyncStorage.getItem(REPORTS_KEY);
  if (!raw) return [];
  try {
    const stored: (Partial<BlockerReport> & { photoUri?: string })[] =
      JSON.parse(raw);
    return stored.map(({ photoUri, ...report }) => ({
      ...(report as BlockerReport),
      reportedBy: report.reportedBy ?? LOCAL_REPORTER_ID,
      photos:
        photoUri && !report.photos?.length ? [photoUri] : report.photos,
    }));
  } catch {
    return [];
  }
}

/**
 * Where a report got to, and what was shown for it.
 *
 * Kept beside the reports rather than inside them because half of what the
 * screen lists are seeds, and a seed lives in the source, not in storage:
 * there is no row to edit. One mechanism covering both is what keeps the
 * Sesizări screen from growing buttons that work on the reports this driver
 * filed and quietly do nothing on the rest.
 */
interface ReportProgress {
  status: ReportStatus;
  resolution?: ReportResolution;
}

/** Report id to where it got to. Corrupt reads as none. */
async function loadReportProgress(): Promise<Record<string, ReportProgress>> {
  const raw = await AsyncStorage.getItem(REPORT_STATUS_KEY);
  if (!raw) return {};
  try {
    const stored: Record<string, ReportProgress | ReportStatus> =
      JSON.parse(raw);
    // Written before a status could carry proof, when the value was the
    // status itself.
    return Object.fromEntries(
      Object.entries(stored).map(([id, value]) => [
        id,
        typeof value === "string" ? { status: value } : value,
      ]),
    );
  } catch {
    return {};
  }
}

/**
 * Every spot the map should show: what the backend knows, then whatever of the
 * imported layers it did not already carry.
 *
 * The imported car parks exist twice on purpose -- bundled in
 * `constants/`, and as rows once `scripts/import-parking.mjs` has been run
 * against a project. The duplication is not an accident to be tidied away.
 * Bundled, they are what makes a fresh clone with no credentials open on a real
 * map of Bucharest. Stored, they are what a `status_reports` foreign key points
 * at when a driver standing in one says there is space: without the row, the
 * whole imported layer would be read-only in the one build where reporting
 * matters.
 *
 * So they are joined by id rather than concatenated, and the stored row wins.
 * It is the one that can have been corrected since the import, and it is the
 * one carrying the claims -- appending the bundled copy after it would put a
 * second, observation-less version of the same car park on the map, drawn
 * "Fără raportări" directly on top of the one somebody just reported on.
 */
export async function getSpots(): Promise<ParkingSpot[]> {
  if (isRemote()) {
    const { fetchSpots } = await import("@/lib/supabase-data.ts");
    const stored = await fetchSpots();
    const known = new Set(stored.map((spot) => spot.id));
    return [...stored, ...IMPORTED_PARKING.filter((spot) => !known.has(spot.id))];
  }
  return IMPORTED_PARKING;
}

/**
 * Every blocker report the app knows about, each carrying where it got to and
 * whatever was shown for it.
 *
 * Nothing is invented here either: with no project configured this is what was
 * filed on this phone and nothing else, so an empty Sesizări tab means nobody
 * has reported a blocked pavement yet -- which is true, and better than three
 * fictional complaints about streets nobody photographed.
 *
 * With a project configured, reports are rows other drivers can see, which is
 * the entire point of moving them off the device. The identity is resolved
 * first because `isMine` is asked while the list renders and cannot wait.
 */
export async function getReports(): Promise<BlockerReport[]> {
  if (isRemote()) {
    const [, { fetchReports }] = await Promise.all([
      resolveIdentity(),
      import("@/lib/supabase-data.ts"),
    ]);
    return fetchReports();
  }
  const [stored, progress] = await Promise.all([
    loadStoredReports(),
    loadReportProgress(),
  ]);
  return stored.map((report) => {
    const moved = progress[report.id];
    return moved ? { ...report, ...moved } : report;
  });
}

/** One report by id, or undefined. */
export async function getReportById(
  id: string,
): Promise<BlockerReport | undefined> {
  if (isRemote()) {
    const [, { fetchReportById }] = await Promise.all([
      resolveIdentity(),
      import("@/lib/supabase-data.ts"),
    ]);
    return fetchReportById(id);
  }
  return (await getReports()).find((report) => report.id === id);
}

export async function addReport(
  input: Omit<BlockerReport, "id" | "createdAt" | "status" | "reportedBy">
): Promise<BlockerReport> {
  const report: BlockerReport = {
    ...input,
    id: newId("r"),
    createdAt: new Date().toISOString(),
    status: "open",
    reportedBy: currentIdentity(),
  };
  if (isRemote()) {
    const { insertReport } = await import("@/lib/supabase-data.ts");
    return insertReport(report);
  }
  const stored = await loadStoredReports();
  await AsyncStorage.setItem(REPORTS_KEY, JSON.stringify([report, ...stored]));
  publish("reports");
  return report;
}

/** What the author is allowed to change after the fact. */
export type ReportEdit = Partial<
  Pick<BlockerReport, "category" | "plate" | "note" | "photos">
>;

/**
 * Correct a report already filed.
 *
 * Only what the driver typed can change. Where the blockage is and when it was
 * seen cannot, because a report is a claim about a place at a time: editing
 * those would not be a correction, it would be a different report wearing the
 * first one's history. It is also why the edit reaches only reports in
 * storage; a seed belongs to somebody else, and `isMine` is what the screens
 * check before offering this at all.
 */
export async function updateReport(
  id: string,
  edit: ReportEdit,
): Promise<void> {
  if (isRemote()) {
    const { updateReportRow } = await import("@/lib/supabase-data.ts");
    return updateReportRow(id, edit);
  }
  const stored = await loadStoredReports();
  const index = stored.findIndex((report) => report.id === id);
  if (index < 0) throw new Error(`No report of this device's to edit: ${id}`);
  stored[index] = { ...stored[index], ...edit };
  await AsyncStorage.setItem(REPORTS_KEY, JSON.stringify(stored));
  publish("reports");
}

/**
 * A spot with how far the driver has to go to reach it.
 *
 * `distance` is from the driver, not from a destination they searched for.
 * That is the whole difference between this screen and the search: here the
 * destination *is* wherever they are standing.
 */
export type NearbySpot<T extends ParkingSpot = ParkingSpot> = T & {
  /** Metres from the driver, straight line. */
  distance: number;
  /** Minutes on foot. */
  walkMin: number;
};

/**
 * What a spot costs, as one number that can be sorted.
 *
 * Three cases and they are not on one scale, so they are flattened onto one
 * deliberately. Known free sorts first. A known price sorts by what it is.
 * Unknown sorts last -- not because it is expensive, but because a driver
 * choosing between a kerb they know is free and one nobody has priced should be
 * offered the one they can act on. Bucharest makes this the common case: the
 * blue zone charges, the white spaces need a permit, and neither is published
 * anywhere an app can read.
 */
export function priceRank(spot: Pick<ParkingSpot, "pricePerHour" | "paid">): number {
  if (spot.paid === false) return 0;
  if (spot.pricePerHour !== undefined) return spot.pricePerHour;
  return Number.POSITIVE_INFINITY;
}

/**
 * The order a driver actually wants: nearest first, cheapest among equals.
 *
 * Walk time rather than metres is what groups them, and that is the point of
 * sorting on it. Two kerbs ninety metres apart are the same walk, so the second
 * question gets to decide between them; sorting on raw distance would let a
 * forty-metre difference nobody can feel bury a space that costs nothing.
 */
export function compareForDriver(a: NearbySpot, b: NearbySpot): number {
  return (
    a.walkMin - b.walkMin ||
    priceRank(a) - priceRank(b) ||
    a.distance - b.distance
  );
}

/**
 * Everything worth walking to from where the driver is, best first.
 *
 * Nothing is dropped on availability: the hundred car parks imported from
 * OpenStreetMap carry no observation at all, so such a filter would hide every
 * real car park in the city and leave a driver looking at nothing.
 *
 * Pure, so the ordering can be tested without a device or a fix.
 */
export function rankNearby<T extends ParkingSpot>(
  spots: T[],
  origin: LatLng,
  options: { radiusM?: number; limit?: number } = {},
): NearbySpot<T>[] {
  const { radiusM = 1500, limit = 20 } = options;

  return spots
    .map((spot) => {
      const distance = distanceMeters(
        origin.latitude,
        origin.longitude,
        spot.latitude,
        spot.longitude,
      );
      return { ...spot, distance, walkMin: etaMinutes(distance, "walk") };
    })
    .filter((spot) => spot.distance <= radiusM)
    .sort(compareForDriver)
    .slice(0, limit);
}

/** Resolve a single spot by id, across everything the app can see. */
export async function getSpotById(id: string): Promise<ParkingSpot | undefined> {
  if (isRemote()) {
    const { fetchSpotById } = await import("@/lib/supabase-data.ts");
    // An imported car park is bundled whether or not it has been imported into
    // the project, so a driver tapping one on the map must not get "not found"
    // merely because `scripts/import-parking.mjs` has not been run.
    return (await fetchSpotById(id)) ?? IMPORTED_PARKING.find((s) => s.id === id);
  }
  return IMPORTED_PARKING.find((s) => s.id === id);
}
