/**
 * Where a report's photographs live, and how they are shown.
 *
 * Since `0009_evidence_is_private.sql` the bucket is private and the column
 * holds storage paths rather than URLs. Nothing can be rendered straight from
 * the database any more: a path has to be signed first, by a caller the policy
 * agrees is the author.
 *
 * WHY A PATH IS NOT A URL, in the one place it matters to the client. A public
 * URL is a capability -- everything needed to fetch the file, in one string --
 * and this app was keeping several of them per report in a table readable by
 * anybody with the anon key. A path is inert. It names a file and opens
 * nothing, so it is safe in a row, safe in a log and safe in a crash report,
 * and the only thing that turns it into bytes is a signature with a clock on
 * it.
 *
 * The pure half of this module is here rather than in `lib/supabase-data.ts`
 * so `node --test` can load it: telling a local photograph from a stored one
 * is the decision that says whether to upload, and getting it wrong either
 * re-uploads every picture on every edit or writes a signed URL into the
 * column as though it were a path.
 */

/** The bucket. Private since 0009; nothing serves it unsigned. */
export const PHOTO_BUCKET = "report-photos";

/**
 * How long a link to somebody's evidence stays good.
 *
 * Ten minutes: long enough to open a report, scroll it and look at every
 * photograph on a slow connection, short enough that a URL copied out of a log
 * or shoulder-read off a screen is worthless by the time it is used. It is not
 * a session -- a screen left open past it re-signs rather than keeps a link
 * alive, because the point of the expiry is that leaked links die.
 */
export const SIGNED_URL_TTL_S = 600;

/**
 * Whether this is a photograph already in storage, or one off the phone.
 *
 * The whole question `uploadPhotos` asks, and it used to be spelled
 * `/^https?:\/\//` -- true of anything already on the internet, which was the
 * right test while the column held public URLs and is the wrong one now. A
 * stored photograph is a path with no scheme at all, so the test is for the
 * *absence* of one: `file://` and `content://` come off a camera roll,
 * everything else in this app's hands is ours.
 *
 * Getting this backwards is expensive in both directions. Read as local, a
 * stored photograph is fetched and uploaded again on every correction, under a
 * new name, leaving the old file orphaned in a private bucket where nothing
 * will ever point at it. Read as stored, a camera roll URI is written into the
 * column as though it were a path, and the evidence is a string naming a file
 * on one telephone.
 */
export function isStoredPhoto(uri: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(uri);
}

/**
 * Where a photograph belongs in the bucket.
 *
 * `<uploader uuid>/<report id>/<millis>-<index>.<ext>`, and the first two
 * segments are both load-bearing. The uuid is what the storage policies check,
 * so a driver can neither read nor overwrite anybody else's folder. The report
 * id is what `forget_old_evidence` matches on when a report ages out, and
 * without it retention would have to read every row to find the files.
 */
export function evidencePath(
  ownerId: string,
  reportId: string,
  extension: string,
  index: number,
  now: number = Date.now(),
): string {
  return `${ownerId}/${reportId}/${now}-${index}.${extension}`;
}

/**
 * The report a stored photograph belongs to, or undefined if it is not ours.
 *
 * For checking, before an edit is saved, that the paths coming back are the
 * ones that went out. A client that has been handed a path is not thereby
 * entitled to write it onto a different report, and the database has no way to
 * notice: `photos` is a `text[]`, so any string at all is a valid value.
 */
export function reportOfPath(path: string): string | undefined {
  const segments = path.split("/");
  return segments.length === 3 ? segments[1] : undefined;
}
