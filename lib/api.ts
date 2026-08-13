import AsyncStorage from "@react-native-async-storage/async-storage";

import { CMPB_PARKING } from "@/constants/cmpb-parking.ts";
import { PUBLIC_PARKING } from "@/constants/public-parking.ts";
import {
  BUCHAREST,
  distanceMeters,
  etaMinutes,
  type LatLng,
} from "@/lib/geo.ts";
import { currentIdentity, LOCAL_IDENTITY, resolveIdentity } from "@/lib/identity.ts";
import { publish } from "@/lib/live.ts";
import { isRemote } from "@/lib/remote.ts";
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
 * How close an OpenStreetMap car park has to be to a CMPB lot before it is
 * taken to be the same asphalt seen twice.
 *
 * A hundred metres sounds generous for "the same place" and is not, because of
 * what the two coordinates actually are. Neither registry marks a car park's
 * entrance: CMPB records one point per lot and OSM's `out center` returns the
 * centroid of a polygon, so a long stretch of kerb along one street is a point
 * in the middle of it in one file and a point at the end of it in the other.
 * Piața Constituției lands 47 m apart and Ferdinand 102 m apart, and both are
 * plainly one car park.
 */
const SAME_PLACE_M = 100;

/** A degree of latitude in metres. Longitude shrinks by cos(latitude). */
const M_PER_DEG_LAT = 111_320;

/**
 * Every car park the app knows about without asking anybody: the blue zone,
 * then whatever OpenStreetMap has that CMPB does not already operate.
 *
 * Two sources because they answer different questions. CMPB knows every space
 * it operates, how many bays it has and what it charges, and nothing about a
 * car park it does not run. OSM knows the free kerbs, the mall garages and the
 * out-of-town ones, and carries almost no tariffs. Neither alone is a map of
 * Bucharest.
 *
 * WHERE THEY OVERLAP, CMPB WINS AND THE OSM COPY IS DROPPED. Sixteen of the 97
 * OSM car parks sit within `SAME_PLACE_M` of a CMPB lot, and they are the same
 * places under different names -- `Parcare National Arena` is CMPB's
 * `Lia Manoliu` to the metre, `Parcare Piața Operei` is `Opera` three metres
 * away.
 *
 * Keeping both was the earlier choice here and it was wrong, for a reason
 * stronger than tidiness. The duplicates do not merely repeat each other, they
 * contradict each other, and the OSM side is the one that is wrong: OSM has
 * `Piața Gemeni` and `Parcare SUUB` as `fee=no`, so the app drew "Gratuit" over
 * two lots where CMPB charges 5 lei an hour. A driver acting on that gets a
 * fine, and "there were two pins and one of them was right" is no defence.
 *
 * CMPB is authoritative for its own lots in the only sense that matters: it is
 * the company taking the money. So a CMPB lot is never dropped in favour of an
 * OSM one, only the other way round.
 *
 * Computed once, at module load. The bounding-box test before the haversine is
 * what keeps 97 x 768 pairs from being 74,000 trigonometric calls.
 */
const IMPORTED_PARKING: ParkingSpot[] = (() => {
  const cosLat = Math.cos((BUCHAREST.latitude * Math.PI) / 180);
  const dLat = SAME_PLACE_M / M_PER_DEG_LAT;
  const dLng = SAME_PLACE_M / (M_PER_DEG_LAT * cosLat);

  const operatedByCmpb = (spot: ParkingSpot) =>
    CMPB_PARKING.some(
      (lot) =>
        Math.abs(lot.latitude - spot.latitude) <= dLat &&
        Math.abs(lot.longitude - spot.longitude) <= dLng &&
        distanceMeters(
          spot.latitude,
          spot.longitude,
          lot.latitude,
          lot.longitude,
        ) <= SAME_PLACE_M,
    );

  return [...CMPB_PARKING, ...PUBLIC_PARKING.filter((s) => !operatedByCmpb(s))];
})();

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
      reportedBy: report.reportedBy ?? LOCAL_IDENTITY,
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
 * A spot with how far it is from where the driver actually wants to end up.
 *
 * BOTH FIELDS ARE MEASURED FROM THE DESTINATION, NOT FROM THE CAR. That is the
 * app's whole idea of "near": a driver does not care how far the car park is
 * from the road they are on, they care how far they will have to walk once
 * they have left the car. So `walkMin` is the walk from this car park to the
 * place they are heading for, which is the number that decides whether a spot
 * is worth taking.
 *
 * The destination is whatever `rankNearby` was handed. With nothing searched
 * for it is the driver's own position -- they are standing at the place they
 * want to be, and the walk is the one back to it after parking. Once a search
 * exists it is the searched place instead, and nothing here has to change:
 * the meaning of the number was never "distance from you", so pointing it at a
 * destination does not reinterpret it.
 */
export type NearbySpot<T extends ParkingSpot = ParkingSpot> = T & {
  /** Metres from the destination, straight line. */
  distance: number;
  /** Minutes on foot from this car park to the destination. */
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
 * Everything worth walking to from the destination, best first.
 *
 * `origin` is that destination -- the place the driver wants to end up, which
 * is their own position until a search gives them another one. Everything here
 * is measured from it rather than from the car, because the walk after parking
 * is what a driver is actually choosing between.
 *
 * Nothing is dropped on availability: the imported car parks carry no
 * observation at all, so such a filter would hide every real car park in the
 * city and leave a driver looking at nothing.
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

/**
 * Links an `Image` can render, for photographs already filed.
 *
 * The seam the screens use, so none of them has to know whether there is a
 * backend. With a project configured the bucket is private and this asks
 * storage for links with a clock on them; without one the photographs never
 * left the phone, so their `file://` URIs already are what an `Image` wants
 * and they come straight back.
 *
 * Returned in the order given, so a caller can pair them with the paths it
 * asked about.
 */
export async function signEvidence(paths: string[]): Promise<string[]> {
  if (!paths.length) return [];
  if (!isRemote()) return paths;
  const { signEvidence: sign } = await import("@/lib/supabase-data.ts");
  return sign(paths);
}

/** What one driver has actually done, for their own profile. */
export interface ReportTally {
  /** Reports this identity filed. */
  filed: number;
  /** Of those, the ones somebody has since shown to be cleared. */
  resolved: number;
}

/**
 * Count what a driver has filed, from reports already in hand.
 *
 * Takes the list rather than fetching one, so the profile screen counts the
 * same reports the Sesizări tab is showing rather than a second query that
 * could disagree with it -- and so this can be tested without a device.
 *
 * `resolved` is counted rather than `open`, because it is the number worth
 * showing. A complaint that is still open is a complaint nobody has acted on,
 * and a profile that led with it would be telling a driver their reports do
 * not work; the cleared ones are the evidence that they do.
 */
export function tallyReports(
  reports: BlockerReport[],
  identity: string,
): ReportTally {
  const mine = reports.filter((report) => report.reportedBy === identity);
  return {
    filed: mine.length,
    resolved: mine.filter((report) => report.status === "resolved").length,
  };
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
