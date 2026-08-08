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
  StatusReportRow,
} from "@/types/database.ts";

import { decodeDataUrl } from "./base64.ts";
import type { SpotReport } from "./spot-state.ts";
import { SupabaseError, currentReporterId, supabase } from "./supabase.ts";
import {
  toAvailabilityWindows,
  toWindowInsert,
  toBlockerReport,
  toBlockerReports,
  toParkingSpots,
  toReportInsert,
  toSpotReport,
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
const REPORT_WINDOW_DAYS = 30;

function client() {
  const supabaseClient = supabase();
  if (!supabaseClient) {
    throw new Error("lib/supabase-data.ts loaded without a configured project");
  }
  return supabaseClient;
}

function since(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

async function recentReportRows(): Promise<StatusReportRow[]> {
  const { data, error } = await client()
    .from("status_reports")
    .select("*")
    .gte("created_at", since(REPORT_WINDOW_DAYS * 24))
    .order("created_at", { ascending: false })
    .returns<StatusReportRow[]>();
  if (error) throw new SupabaseError("Could not read status_reports", error);
  return data ?? [];
}

/**
 * How many of one spot's claims the detail screen reads.
 *
 * A count rather than a window, because for a single spot it is strictly
 * better: a busy kerb gives fifty recent claims, a forgotten one gives its
 * last few however old they are, and either way the query is bounded by a
 * number instead of by how popular the street happens to be.
 */
const SPOT_CLAIM_SAMPLE = 50;

/** Every spot, with the newest claim about it flattened on. */
export async function fetchSpots(): Promise<ParkingSpot[]> {
  const [spots, reports] = await Promise.all([
    client().from("spots").select("*").returns<SpotRow[]>(),
    recentReportRows(),
  ]);
  if (spots.error) throw new SupabaseError("Could not read spots", spots.error);
  return toParkingSpots(spots.data ?? [], reports);
}

/** Every claim recent enough to still be worth weighing. */
export async function fetchStatusReports(): Promise<SpotReport[]> {
  return (await recentReportRows()).map(toSpotReport);
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

/** File a claim about a spot, as the signed-in user. */
export async function insertStatusReport(input: {
  spotId: string;
  status: SpotStatus;
  reporterId?: string;
  leavingInMin?: number;
  spaces?: number;
}): Promise<SpotReport> {
  const reporterId = input.reporterId ?? (await currentReporterId());
  const { data, error } = await client()
    .from("status_reports")
    .insert({
      spot_id: input.spotId,
      status: input.status,
      reporter_id: reporterId,
      leaving_in_min: input.leavingInMin ?? null,
      spaces: input.spaces ?? null,
    } satisfies StatusReportInsert)
    .select()
    .returns<StatusReportRow[]>()
    .single();
  if (error || !data) {
    throw new SupabaseError("Could not file the status report", error);
  }
  return toSpotReport(data);
}

// ---------------------------------------------------------------------------
// Blocker reports
// ---------------------------------------------------------------------------

/** Where the photographs live. Public, because a forwarded complaint is text. */
const PHOTO_BUCKET = "report-photos";

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

/** A photo already on the internet needs no uploading. */
const isUploaded = (uri: string) => /^https?:\/\//i.test(uri);

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
 * Put the photographs somewhere everybody can see them, and return the URLs.
 *
 * Uploads land under the uploader's own uuid because the storage policy says
 * so: one driver cannot overwrite another's evidence by guessing a path.
 * Anything already served over http is passed through untouched, which is what
 * makes editing a report cheap — the photos that did not change are not
 * re-uploaded.
 */
async function uploadPhotos(
  reportId: string,
  uris: string[],
  ownerId: string,
): Promise<string[]> {
  const storage = client().storage.from(PHOTO_BUCKET);
  const urls: string[] = [];

  for (const [index, uri] of uris.entries()) {
    if (isUploaded(uri)) {
      urls.push(uri);
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
    const path = `${ownerId}/${reportId}/${Date.now()}-${index}.${extension}`;
    const { error } = await storage.upload(path, bytes, { contentType });
    if (error) throw new SupabaseError("Could not upload the photo", error);
    urls.push(storage.getPublicUrl(path).data.publicUrl);
  }

  return urls;
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

  /* Every column except the plate, and named rather than `*`. The plate is
     revoked on this table, so asking for it back would fail -- and there is
     nothing to ask for: the caller supplied it a line ago. */
  const { data, error } = await client()
    .from("reports")
    .insert(toReportInsert({ ...report, photos }, author))
    .select(
      "id, category, latitude, longitude, address, note, photos, created_by, created_at",
    )
    .returns<Omit<ReportRow, "plate">[]>()
    .single();
  if (error || !data) throw new SupabaseError("Could not file the report", error);
  return toBlockerReport({ ...data, plate: report.plate ?? null });
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
  if (edit.photos) patch.photos = await uploadPhotos(id, edit.photos, author);

  const { error } = await client().from("reports").update(patch).eq("id", id);
  if (error) throw new SupabaseError("Could not correct the report", error);
}

/** One spot by id, or undefined when there is no such row. */
export async function fetchSpotById(id: string): Promise<ParkingSpot | undefined> {
  const [spot, reports] = await Promise.all([
    client().from("spots").select("*").eq("id", id).returns<SpotRow[]>().maybeSingle(),
    client()
      .from("status_reports")
      .select("*")
      .eq("spot_id", id)
      .order("created_at", { ascending: false })
      .limit(SPOT_CLAIM_SAMPLE)
      .returns<StatusReportRow[]>(),
  ]);
  if (spot.error) throw new SupabaseError("Could not read spot", spot.error);
  if (reports.error) {
    throw new SupabaseError("Could not read status_reports", reports.error);
  }
  if (!spot.data) return undefined;
  return toParkingSpots([spot.data], reports.data ?? [])[0];
}
