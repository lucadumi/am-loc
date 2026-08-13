/**
 * The queries. One place where SQL tables meet app types.
 *
 * Loaded only when `isRemote()` is true. Every seam in the data layer reaches
 * this module through a dynamic `import()` rather than a top-level one, which
 * is what keeps `@supabase/supabase-js`, the URL polyfill and the auth session
 * out of the startup path of an app running on seed data, and out of the unit
 * tests entirely.
 *
 * Nothing here falls back to the bundled fixtures when a query fails. A
 * developer who has configured a project and gets an error needs to see the
 * error: quietly substituting invented spots for real ones would turn a broken
 * connection into a map full of parking places that do not exist.
 */

import type {
  AvailabilityWindow,
  BlockerReport,
  ParkingSpot,
  SpotStatus,
} from "@/types";
import type {
  AvailabilityWindowRow,
  ReportEventRow,
  ReportRow,
  ReportUpdate,
  SpotRow,
  StatusReportInsert,
} from "@/types/database.ts";

import { decodeDataUrl } from "./base64.ts";
import {
  PHOTO_BUCKET,
  SIGNED_URL_TTL_S,
  evidencePath,
  isStoredPhoto,
  reportOfPath,
} from "./evidence.ts";
import { SupabaseError, currentReporterId, supabase } from "./supabase.ts";
import {
  toAvailabilityWindows,
  toWindowInsert,
  toBlockerReport,
  toBlockerReports,
  toParkingSpot,
  toParkingSpots,
  toReportInsert,
} from "./supabase-rows.ts";

/**
 * How far back to read claims.
 *
 * Twenty-four hours is the tempting answer: the longest half-life in the
 * belief model is 25 minutes, so a day-old report has decayed to a rounding
 * error. That reasoning is correct about a claim's *weight* and misses what
 * else this query decides.
 *
 * `toParkingSpot` flattens the newest claim onto the spot, and a spot with no
 * claim at all reads as `taken`, attributed to nobody. A short window would
 * therefore not age anything gracefully; it would be a cliff. At 23 hours a
 * kerb reads "Liber, învechit" and a driver can judge it for themselves; at 25
 * hours the same kerb would vanish from every free-spots list in the app, and
 * the map would turn it red on no evidence whatsoever. A city whose reports
 * happened to pause for a day — a public holiday, a quiet week, a demo left
 * alone overnight — would show as a city with nothing free in it.
 *
 * A month is well past the point where anything here can move a belief, so
 * nothing about the ranking changes. What it buys is that the belief model
 * gets to do the ageing, which is its job: an old claim comes back, decays to
 * `stale`, and is drawn hollow and sorted last instead of being deleted by a
 * `where` clause.
 *
 * This is a window, not a cure. A kerb whose last report is older than this
 * still falls off, and the principled fix is a `distinct on (spot_id)` view so
 * the newest claim per spot is always readable at a bounded cost. That is
 * worth doing when the table is large enough to care; today it would be
 * ceremony around thirty rows.
 */

function client() {
  const supabaseClient = supabase();
  if (!supabaseClient) {
    throw new Error("lib/supabase-data.ts loaded without a configured project");
  }
  return supabaseClient;
}

/** Every spot the project knows about. */
export async function fetchSpots(): Promise<ParkingSpot[]> {
  const spots = await client().from("spots").select("*").returns<SpotRow[]>();
  if (spots.error) throw new SupabaseError("Could not read spots", spots.error);
  return toParkingSpots(spots.data ?? []);
}

/**
 * Every window any owner is offering.
 *
 * Read by everybody, which is the point: a listing nobody can see helps nobody.
 * Only writing is restricted, and that restriction belongs in the table's row
 * level security policies rather than here: a rule the client enforces is a
 * rule an attacker skips.
 */
export async function fetchAvailabilityWindows(): Promise<AvailabilityWindow[]> {
  const { data, error } = await client()
    .from("availability_windows")
    .select("*")
    .returns<AvailabilityWindowRow[]>();
  if (error) throw new SupabaseError("Could not load the availability", error);
  return toAvailabilityWindows(data ?? []);
}

/**
 * Offer a stretch of time on a spot you own.
 *
 * The owner id is taken from the session, never from the caller. Postgres
 * refuses anything else, and passing it explicitly would only give a caller the
 * impression that it was theirs to choose.
 */
export async function insertAvailabilityWindow(
  window: AvailabilityWindow,
): Promise<void> {
  const ownerId = await currentReporterId();
  const { error } = await client()
    .from("availability_windows")
    .insert(toWindowInsert(window, ownerId));
  if (error) throw new SupabaseError("Could not offer the spot", error);
}

/**
 * Withdraw a window.
 *
 * No owner check here on purpose. The delete policy scopes the statement to the
 * caller's own rows, so a request for somebody else's window deletes nothing
 * rather than being refused -- and a client-side check would only be a second,
 * weaker copy of a rule the database already enforces.
 */
export async function deleteAvailabilityWindow(id: string): Promise<void> {
  const { error } = await client().from("availability_windows").delete().eq("id", id);
  if (error) throw new SupabaseError("Could not withdraw the offer", error);
}

// ---------------------------------------------------------------------------
// Blocker reports
// ---------------------------------------------------------------------------

function since(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

/** How far back the Sesizări tab reads. A blockage is news, not an archive. */
const REPORT_HISTORY_DAYS = 30;

/** Extensions worth naming; anything else keeps whatever the platform said. */
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/webp": "webp",
};



/**
 * Read a local photo as bytes.
 *
 * The long way round, and it has to be. Supabase Storage takes an
 * `ArrayBuffer` from React Native and does not reliably take the `Blob`,
 * `File` or `FormData` a browser would hand it, because all three are
 * polyfills here. `FileReader` is the one bridge from a `file://` URI to
 * base64 that exists without adding a native module, and the data URL it
 * produces carries the media type the platform sniffed, which is the only
 * honest source for the upload's content type.
 */
async function bytesOf(uri: string) {
  const blob = await (await fetch(uri)).blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read the photo"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
  return decodeDataUrl(dataUrl);
}

/**
 * Put the photographs in the private bucket, and return their paths.
 *
 * Uploads land under the uploader's own uuid because the storage policies say
 * so: since 0009 that is what decides who may read them back, as well as what
 * stops one driver overwriting another's evidence by guessing a path.
 *
 * A photograph already in storage is passed through untouched, which is what
 * makes correcting a report cheap — the pictures that did not change are not
 * fetched and sent again. `isStoredPhoto` is what tells the two apart, and it
 * asks whether the string has a scheme rather than whether it is http: paths
 * have none, and a public URL is no longer a thing this app produces.
 */
async function uploadPhotos(
  reportId: string,
  uris: string[],
  ownerId: string,
): Promise<string[]> {
  const storage = client().storage.from(PHOTO_BUCKET);
  const paths: string[] = [];

  for (const [index, uri] of uris.entries()) {
    if (isStoredPhoto(uri)) {
      paths.push(uri);
      continue;
    }
    const { bytes, contentType } = await bytesOf(uri);
    const extension = EXTENSIONS[contentType.toLowerCase()];
    /* Refused here rather than uploaded as `.bin`. The bucket's mime list
       would reject it anyway, and a stored file nothing can open is worse
       than a report that says plainly which photograph it could not take. */
    if (!extension) {
      throw new Error(`Nu pot trimite o fotografie de tip ${contentType}`);
    }
    const path = evidencePath(ownerId, reportId, extension, index);
    const { error } = await storage.upload(path, bytes, { contentType });
    if (error) throw new SupabaseError("Could not upload the photo", error);
    paths.push(path);
  }

  return paths;
}

/**
 * Signed links to a report's photographs, in the order they were taken.
 *
 * Nothing renders a path. The bucket is private, so a picture is shown by
 * asking storage for a link with a clock on it, and storage answers only for
 * a caller its policies agree is the author — which means this returns an
 * empty list for somebody else's report rather than failing, and the screen
 * simply has no pictures to draw.
 *
 * Signed at the moment of display and never stored. A signed URL kept in a
 * row, a cache or a log is a public URL with a slower fuse, which is the thing
 * 0009 exists to get rid of.
 */
export async function signEvidence(paths: string[]): Promise<string[]> {
  if (!paths.length) return [];
  const { data, error } = await client()
    .storage.from(PHOTO_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_S);
  if (error) throw new SupabaseError("Could not open the photos", error);
  /* A path storage would not sign is dropped rather than rendered as a broken
     image. It means the file is gone -- retention took it, or a correction
     replaced it -- and an empty frame says "this app lost your evidence" about
     a picture that is simply no longer there. */
  return (data ?? [])
    .map((signed) => signed.signedUrl)
    .filter((url): url is string => !!url);
}

async function reportEventRows(reportIds?: string[]): Promise<ReportEventRow[]> {
  let query = client().from("report_events").select("*");
  if (reportIds) query = query.in("report_id", reportIds);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .returns<ReportEventRow[]>();
  if (error) throw new SupabaseError("Could not read report_events", error);
  return data ?? [];
}

/**
 * Every report worth showing, newest first, with what was done about each.
 *
 * Read through `reports_readable` rather than `reports`, which is what keeps
 * one driver from reading another's number plate: the view nulls the column
 * for anyone but its author, and the plate is revoked on the table itself so
 * this is the only way to it. See `0006_hide_plates_from_strangers.sql`.
 */
export async function fetchReports(): Promise<BlockerReport[]> {
  const { data, error } = await client()
    .from("reports_readable")
    .select("*")
    .gte("created_at", since(REPORT_HISTORY_DAYS * 24))
    .order("created_at", { ascending: false })
    .returns<ReportRow[]>();
  if (error) throw new SupabaseError("Could not read reports", error);

  const rows = data ?? [];
  if (!rows.length) return [];
  return toBlockerReports(
    rows,
    await reportEventRows(rows.map((row) => row.id)),
  );
}

/** One report by id, or undefined when there is no such row. */
export async function fetchReportById(
  id: string,
): Promise<BlockerReport | undefined> {
  const [report, events] = await Promise.all([
    client()
      .from("reports_readable")
      .select("*")
      .eq("id", id)
      .returns<ReportRow[]>()
      .maybeSingle(),
    reportEventRows([id]),
  ]);
  if (report.error) throw new SupabaseError("Could not read report", report.error);
  if (!report.data) return undefined;
  return toBlockerReport(report.data, events);
}

/**
 * File a report, photographs and all.
 *
 * The photos go up first. A row pointing at pictures that failed to upload is
 * a complaint with no evidence, and the evidence is the only part of a blocker
 * report that cannot be recovered afterwards: the car will have gone.
 */
export async function insertReport(
  report: BlockerReport,
): Promise<BlockerReport> {
  const author = await currentReporterId();
  const photos = await uploadPhotos(report.id, report.photos ?? [], author);

  /* Named columns rather than `*`, and three of them deliberately missing.
     `plate` and `photos` are revoked on this table -- personal data and the
     only unaudited route to somebody's evidence -- so asking for either back
     would fail outright, and `photo_count` belongs to the view. */
  const { data, error } = await client()
    .from("reports")
    .insert(toReportInsert({ ...report, photos }, author))
    .select("id, category, latitude, longitude, address, note, created_by, created_at")
    .returns<Omit<ReportRow, "plate" | "photos" | "photo_count">[]>()
    .single();
  if (error || !data) throw new SupabaseError("Could not file the report", error);
  /* Put back rather than read, and nothing is lost by that: the row was
     written a line ago from exactly these values, so reading them again would
     only be asking the database to confirm what this function just said. */
  return toBlockerReport({
    ...data,
    plate: report.plate ?? null,
    photos,
    photo_count: photos.length,
  });
}

/**
 * Correct a report already filed.
 *
 * Only the typed parts travel. Where the blockage is, when it was seen and who
 * saw it are refused by a trigger on the table rather than by politeness here,
 * which is what makes the rule true of any client rather than of this one.
 */
export async function updateReportRow(
  id: string,
  edit: ReportUpdate & { photos?: string[] },
): Promise<void> {
  const author = await currentReporterId();
  const patch: ReportUpdate = { ...edit };
  if (edit.photos) {
    /* Refused here rather than written. `photos` is a `text[]`, so Postgres
       will accept any string at all -- including a path belonging to another
       report, which would attach somebody else's evidence to this complaint
       while leaving the storage policies perfectly happy, because the file is
       still in its own author's folder. */
    const stray = edit.photos.find(
      (uri) => isStoredPhoto(uri) && reportOfPath(uri) !== id,
    );
    if (stray) {
      throw new Error(`A photo from another report cannot be attached: ${stray}`);
    }
    patch.photos = await uploadPhotos(id, edit.photos, author);
  }

  const { error } = await client().from("reports").update(patch).eq("id", id);
  if (error) throw new SupabaseError("Could not correct the report", error);
}

/** One spot by id, or undefined when there is no such row. */
export async function fetchSpotById(id: string): Promise<ParkingSpot | undefined> {
  const { data, error } = await client()
    .from("spots")
    .select("*")
    .eq("id", id)
    .returns<SpotRow[]>()
    .maybeSingle();
  if (error) throw new SupabaseError("Could not read spot", error);
  return data ? toParkingSpot(data) : undefined;
}
