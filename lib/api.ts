import AsyncStorage from "@react-native-async-storage/async-storage";

import { PUBLIC_PARKING } from "@/constants/public-parking.ts";
import { distanceMeters, etaMinutes, type LatLng } from "@/lib/geo.ts";
import { currentIdentity, resolveIdentity } from "@/lib/identity.ts";
import { publish } from "@/lib/live.ts";
import { isRemote } from "@/lib/remote.ts";
import {
  LOCAL_REPORTER_ID,
} from "@/lib/spot-reports.ts";
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
 * configured (see `.env.example`), and from the seeds below when one is not,
 * so a fresh clone with no credentials still opens on a working map of central
 * Bucharest. Blocker reports go the same way now that the schema models them;
 * garage layouts and the "typical day" occupancy curves are still local,
 * because nothing in the database knows a floor plan or an occupancy history.
 *
 * The seeds are never mixed into remote results. An empty `spots` table is a
 * real answer, and padding it with invented kerbs would be a map that lies.
 */

const REPORTS_KEY = "amloc.reports.v1";
const REPORT_STATUS_KEY = "amloc.report-status.v1";
const SPOTS_KEY = "amloc.spots.v1";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();

/** Community-reported parking spots around central Bucharest. */
export const SEED_SPOTS: ParkingSpot[] = [
  {
    id: "s_universitate",
    title: "Bd. Nicolae Bălcescu",
    access: "public",
    source: "community",
    area: "Sector 1 · Universitate",
    rating: 4.6,
    status: "free",
    kind: "street",
    latitude: 44.4357,
    longitude: 26.1015,
    updatedAt: minutesAgo(2),
    availableCount: 2,
    note: "Două locuri lângă intrarea în pasaj.",
    reportedBy: "Andrei",
  },
  {
    id: "s_lipscani",
    title: "Strada Lipscani",
    access: "public",
    source: "community",
    area: "Centrul Vechi",
    rating: 4.4,
    status: "leaving",
    kind: "street",
    latitude: 44.4319,
    longitude: 26.1015,
    updatedAt: minutesAgo(1),
    leavingInMin: 5,
    availableCount: 1,
    reportedBy: "Maria",
  },
  {
    id: "s_romana",
    title: "Piața Romană",
    access: "public",
    source: "community",
    area: "Sector 1 · ASE",
    rating: 4.5,
    status: "free",
    kind: "street",
    latitude: 44.4459,
    longitude: 26.0972,
    updatedAt: minutesAgo(6),
    availableCount: 1,
    reportedBy: "Ioana",
  },
  {
    id: "s_unirii",
    title: "Piața Unirii",
    access: "public",
    source: "community",
    area: "Sector 3 · Unirii",
    rating: 4.1,
    status: "taken",
    kind: "street",
    latitude: 44.4271,
    longitude: 26.1024,
    updatedAt: minutesAgo(9),
    availableCount: 0,
    note: "Plin, dar se eliberează des dimineața.",
  },
  {
    id: "s_cismigiu",
    title: "Bd. Regina Elisabeta",
    access: "public",
    source: "community",
    area: "Sector 5 · Cișmigiu",
    rating: 4.7,
    status: "free",
    kind: "street",
    latitude: 44.4362,
    longitude: 26.0918,
    updatedAt: minutesAgo(3),
    availableCount: 3,
    reportedBy: "Radu",
  },
  {
    id: "s_victoriei",
    title: "Calea Victoriei",
    access: "public",
    source: "community",
    area: "Sector 1 · Victoriei",
    rating: 4.5,
    status: "leaving",
    kind: "street",
    latitude: 44.4432,
    longitude: 26.0966,
    updatedAt: minutesAgo(2),
    leavingInMin: 8,
    availableCount: 1,
    reportedBy: "Elena",
  },
  {
    id: "s_dorobanti",
    title: "Calea Dorobanți",
    access: "public",
    source: "community",
    area: "Sector 1 · Dorobanți",
    rating: 4.3,
    status: "free",
    kind: "street",
    latitude: 44.4571,
    longitude: 26.0958,
    updatedAt: minutesAgo(11),
    availableCount: 2,
  },
  {
    id: "s_kogalniceanu",
    title: "Piața Mihail Kogălniceanu",
    access: "public",
    source: "community",
    area: "Sector 5 · Kogălniceanu",
    rating: 4.0,
    status: "taken",
    kind: "street",
    latitude: 44.4351,
    longitude: 26.0872,
    updatedAt: minutesAgo(14),
    availableCount: 0,
  },
  {
    id: "g_unirii",
    title: "Parcarea Unirii Shopping",
    access: "public",
    source: "community",
    area: "Sector 3 · Unirii",
    rating: 4.6,
    status: "free",
    kind: "garage",
    latitude: 44.4278,
    longitude: 26.1042,
    updatedAt: minutesAgo(1),
    availableCount: 34,
    totalCount: 420,
    pricePerHour: 6,
    reportedBy: "AmLoc",
  },
  {
    id: "g_universitate",
    title: "Parcare subterană Universitate",
    access: "public",
    source: "community",
    area: "Sector 1 · Centru",
    rating: 4.8,
    status: "free",
    kind: "garage",
    latitude: 44.4345,
    longitude: 26.1002,
    updatedAt: minutesAgo(2),
    availableCount: 7,
    totalCount: 300,
    pricePerHour: 7,
    reportedBy: "AmLoc",
  },
  {
    id: "p_floreasca_garaj",
    title: "Garaj, Str. Glinka 12",
    access: "private",
    source: "owner",
    area: "Sector 1 · Floreasca",
    rating: 4.9,
    /* Overwritten by `withBelief` from the owner's windows. Written as `taken`
       rather than `free` because a listing nobody has opened a window on is not
       on offer, and the safe direction for somebody else's garage is shut. */
    status: "taken",
    kind: "garage",
    latitude: 44.465,
    longitude: 26.09,
    updatedAt: minutesAgo(240),
    totalCount: 1,
    // The device itself, so the owner's controls are reachable on a fresh
    // clone. Everything a stranger sees is on the other seed below.
    ownerId: LOCAL_REPORTER_ID,
    ownerName: "Tu",
  },
  {
    id: "p_dorobanti_loc",
    title: "Loc de parcare, Calea Dorobanți 168",
    access: "private",
    source: "owner",
    area: "Sector 1 · Dorobanți",
    rating: 4.7,
    status: "taken",
    kind: "street",
    latitude: 44.4585,
    longitude: 26.0971,
    updatedAt: minutesAgo(300),
    totalCount: 1,
    pricePerHour: 8,
    ownerId: "owner_mihai",
    ownerName: "Mihai",
  },
];

/** Seed blocker reports so the map isn't empty on first launch. */
export const SEED_REPORTS: BlockerReport[] = [
  {
    id: "seed_r1",
    reportedBy: "Andrei",
    category: "sidewalk",
    latitude: 44.4338,
    longitude: 26.0995,
    createdAt: minutesAgo(20),
    status: "forwarded",
    address: "Strada Academiei, Universitate",
    note: "Blochează complet trotuarul, nu se poate trece cu căruciorul.",
    photos: ["sample:tow"],
  },
  {
    id: "seed_r2",
    reportedBy: "Maria",
    category: "crosswalk",
    latitude: 44.4402,
    longitude: 26.0999,
    createdAt: minutesAgo(45),
    status: "open",
    address: "Bd. Lascăr Catargiu, Piața Romană",
    plate: "B 217 XYZ",
    photos: ["sample:parking", "sample:kerb"],
  },
  {
    id: "seed_r3",
    reportedBy: "Ioana",
    category: "ramp",
    latitude: 44.4289,
    longitude: 26.1041,
    createdAt: minutesAgo(90),
    status: "open",
    address: "Strada Sfânta Vineri, Unirii",
  },
];

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
 * Spots announced from this device, newest first.
 *
 * Corrupt storage reads as "no spots" rather than throwing: a half-written
 * value should cost the driver their own announcements, not the whole map.
 */
async function loadPersonalSpots(): Promise<ParkingSpot[]> {
  const raw = await AsyncStorage.getItem(SPOTS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
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
 * Every spot the map should show: the ones announced here, then the seeds.
 *
 * Announced spots come first because they are the newest thing said about
 * this city, and they are in the list at all because a spot a driver publishes
 * and then cannot find is not an announcement, it is a form that discards its
 * input. They are ordinary spots once stored, so they decay, get contested and
 * are believed on exactly the terms as any other; nothing here privileges them
 * beyond order.
 */
export async function getSpots(): Promise<ParkingSpot[]> {
  if (isRemote()) {
    const { fetchSpots } = await import("@/lib/supabase-data.ts");
    return [...(await fetchSpots()), ...PUBLIC_PARKING];
  }
  return [...(await loadPersonalSpots()), ...SEED_SPOTS, ...PUBLIC_PARKING];
}

/**
 * Announce a spot.
 *
 * The status the driver gave rides on the spot itself here, and deliberately
 * is not also filed through `addStatusReport`. Locally a spot carries its own
 * flattened claim, which `spot-belief.reportsFor` reads back via `seedReport`;
 * filing a second copy at a slightly later instant would dodge that function's
 * duplicate check and hand the announcer two votes about one observation. The
 * remote path splits them because the schema does (see `insertSpot`), and the
 * timestamps match exactly there, so the same check collapses them again.
 */

/**
 * Every blocker report the app knows about: the ones filed here, then the
 * seeds, each carrying where it got to and whatever was shown for it.
 *
 * With a project configured there are no seeds and no local progress: reports
 * are rows other drivers can see, which is the entire point of moving them off
 * the device. The identity is resolved first because `isMine` is asked while
 * the list renders and cannot wait for an answer.
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
  return [...stored, ...SEED_REPORTS].map((report) => {
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
 * Deliberately unlike `findParkingNear`, which answers "where can I park near
 * the place I am going" and drops anything it cannot promise will be free.
 * This answers "what is around me", and dropping the unpromisable would empty
 * it: the hundred car parks imported from OpenStreetMap carry no observation at
 * all, so a filter on availability hides every real car park in the city and
 * leaves a driver looking at nothing.
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

/** Baseline hourly occupancy for a central Bucharest spot (index = hour 0–23). */
/**
 * What this kerb is usually like, hour by hour.
 *
 * Measured where the app has enough of its own evidence and estimated where it
 * does not, and `SpotAvailability.source` says which so the screen can. The
 * arithmetic lives in `lib/availability.ts`, which is pure; what happens here
 * is only the fetching, and the fetching is the part that differs between a
 * device holding its own claims and a project holding everybody's.
 */

/** Resolve a single spot by id: seed spots plus any personal ones in storage. */
export async function getSpotById(id: string): Promise<ParkingSpot | undefined> {
  if (isRemote()) {
    const { fetchSpotById } = await import("@/lib/supabase-data.ts");
    // Imported car parks are bundled rather than stored, so they are never rows
    // to fetch; without this a driver tapping one on the map gets "not found".
    return (await fetchSpotById(id)) ?? PUBLIC_PARKING.find((s) => s.id === id);
  }
  const personal = await loadPersonalSpots();
  return [...SEED_SPOTS, ...personal, ...PUBLIC_PARKING].find((s) => s.id === id);
}
