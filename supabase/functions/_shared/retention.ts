/**
 * The decisions the retention job makes, separated from the calls it makes.
 *
 * `0009` and `0012` both stop at the same wall and say so: Postgres can name
 * the photographs that are past their life and it can clear the paths
 * afterwards, but it cannot delete the bytes, and it cannot delete an
 * `auth.users` row. Both of those are HTTP calls with the service key on them.
 * So the database owns two thirds of every retention rule and something else
 * has to own the middle third -- that is `../retention/index.ts`, and this is
 * the half of it that can be reasoned about without a project.
 *
 * WHY THIS IS NOT IN `lib/`. Everything in `lib/` is shipped inside the app to
 * telephones. This code runs in Deno on Supabase's side of the wire, holds the
 * key that bypasses every policy in the schema, and has no business being in
 * the same tree as the client -- least of all in a tree where an import is one
 * autocomplete away. It sits beside the function that runs it, and it is pure,
 * so `node --test` still loads it: the rules below decide whether somebody's
 * photographs survive their own deletion.
 *
 * ---
 *
 * THE ONE RULE. Never clear a pointer before the bytes are gone. A path in
 * `reports.photos` is the only thing that knows where a file is; blanking it
 * while the file is still there leaves a photograph of somebody's car outside
 * somebody's house in a bucket with nothing in the database naming it, which
 * is not retention, it is losing the evidence of what you failed to delete.
 *
 * The job holds to that by clearing one path at a time rather than one report
 * at a time -- `forget_evidence_paths` in `0013`, and the argument for it is
 * there. What follows here is the shape that makes it safe: the expired list
 * is read in pages and each page is deleted and forgotten before the next is
 * asked for, so a page boundary can no longer split a report between a file
 * that went and a name that was thrown away.
 *
 * The mirror of it, and the reason `pathsUnder` exists: an erasure deletes the
 * rows first, so by the time this job runs there is nothing left to read the
 * paths off. The bucket has to be walked by prefix instead -- `erase_me`
 * writes `<uid>/` down for exactly that reason -- and the login goes only once
 * a fresh listing of that prefix comes back empty. Not "once the deletes
 * returned no error": a file uploaded while the sweep was running would sit
 * outside that answer, and after the account is gone nothing in this system
 * can say whose folder it was. A person who asked to be forgotten, whose
 * account is gone and whose pictures are not, has been told something untrue
 * by this app.
 */

/** The bucket the evidence lives in. Private since `0009`. */
export const PHOTO_BUCKET = "report-photos";

/**
 * How many paths go into one `remove()`.
 *
 * The storage API takes a list and there is no reason to send them one at a
 * time; there is a reason not to send ten thousand. A batch that fails takes
 * its whole batch with it -- nothing in it counts as removed and every report
 * it touched waits for tomorrow -- so the number is a bet on how much work one
 * flaky call should be able to cost. A hundred loses a hundred files' worth of
 * progress on a bad night and still crosses a year of a city's reports in a
 * few dozen calls.
 */
export const REMOVE_BATCH = 100;

/** How many entries one `list()` page asks for. */
export const LIST_PAGE = 100;

/**
 * How many expired photographs one pass of the sweep asks for.
 *
 * The list is read in pages and each page is deleted and forgotten before the
 * next is asked for, so the page that comes back is always the *first* one: a
 * path that has been cleared is not returned again. That is what makes the
 * loop self-draining and what makes it safe to stop halfway through a bad
 * night -- there is no offset to lose track of.
 *
 * Below the 1000 rows PostgREST will return, deliberately and with room to
 * spare. A cap that silently truncated a page would be invisible here and
 * indistinguishable from "that is all there is".
 */
export const EVIDENCE_PAGE = 500;

/**
 * How many passes before the sweep gives up for the night.
 *
 * Two things can make the loop go round without finishing: a very large
 * backlog, which is a good reason, and paths the storage API refuses to delete,
 * which come back on the next pass looking exactly like new work. The guard is
 * a ceiling on the first and a way out of the second; whatever is left is in
 * tomorrow's run and in tonight's log.
 */
export const MAX_PASSES = 20;

/**
 * Whether to ask for another page of expired photographs.
 *
 * Progress, not emptiness, is the condition. A pass that cleared nothing has
 * met a set of paths it cannot delete, and asking again returns the same ones:
 * the difference between a backlog and a wall is whether anything moved.
 */
export function keepSweeping(cleared: number, pass: number): boolean {
  return cleared > 0 && pass + 1 < MAX_PASSES;
}

/** A row of `evidence_past_retention()`: one file, and the report it proves. */
export interface ExpiredPhoto {
  report_id: string;
  path: string;
}

/**
 * One entry of a storage `list()`.
 *
 * A folder is an entry with no `id`. That is not a convention this code chose,
 * and it is the only thing separating a report's folder from a file that
 * happens to be named like one, so it is stated here rather than buried at the
 * call site.
 */
export interface StorageEntry {
  name: string;
  id: string | null;
}

/** What one run did, and what it could not do. */
export interface RetentionRun {
  photos_removed: number;
  photos_left: number;
  reports_touched: number;
  erasures_finished: number;
  erasures_incomplete: number;
}

/** A run that has done nothing yet. */
export function emptyRun(): RetentionRun {
  return {
    photos_removed: 0,
    photos_left: 0,
    reports_touched: 0,
    erasures_finished: 0,
    erasures_incomplete: 0,
  };
}

/** Split a list into runs of at most `size`. Order is kept. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new RangeError("A batch has to hold something");
  const batches: T[][] = [];
  for (let at = 0; at < items.length; at += size) {
    batches.push(items.slice(at, at + size));
  }
  return batches;
}

/**
 * Which reports may now have their paths cleared.
 *
 * Gone: the job clears by path, in `forget_evidence_paths`, so there is no
 * longer a decision to make about whether a *report* is finished. What was
 * deleted is what is forgotten. This note is here because the rule it replaced
 * -- clear a report only when every one of its photographs went -- was the
 * right answer to the wrong question, and somebody reading `0009` will come
 * looking for it.
 */

/**
 * One page of a listing, as full object paths and the folders still to walk.
 *
 * The bucket is two deep -- `<uid>/<report id>/<file>` -- so walking somebody's
 * prefix means listing it, then listing each folder it names. The join happens
 * here rather than at the call site because a doubled or missing slash makes a
 * path that deletes nothing and reports no error, which is exactly the shape of
 * bug that leaves a bucket full of a deleted account's pictures.
 */
export function pathsUnder(
  prefix: string,
  entries: readonly StorageEntry[],
): { files: string[]; folders: string[] } {
  const at = prefix.replace(/\/+$/, "");
  const join = (name: string) => (at ? `${at}/${name}` : name);
  const files: string[] = [];
  const folders: string[] = [];

  for (const entry of entries) {
    if (!entry.name) continue;
    if (entry.id === null) folders.push(join(entry.name));
    else files.push(join(entry.name));
  }

  return { files, folders };
}

/**
 * Whether the login may go now.
 *
 * The count is what a *fresh* listing of the prefix found, taken after the
 * deleting rather than deduced from it. The order in `pending_erasures` is
 * storage, then the account, then the receipt, and this is the gate between
 * the first two: deleting the `auth.users` row while a file is still in the
 * bucket loses the last thing that pointed at it, because the prefix is the
 * person's uuid and once the account is gone nothing in this system can say
 * whose folder that was or that it was ever meant to be emptied.
 *
 * A listing that failed counts as "something is there". Not knowing and
 * knowing it is empty are different answers, and only one of them may delete
 * an account.
 */
export function loginMayGo(filesLeft: number): boolean {
  return filesLeft === 0;
}

/**
 * A bearer token compared without saying how far it got.
 *
 * The function is reachable by anybody who finds the URL, and what it does
 * when convinced is delete other people's photographs. Platform JWT
 * verification is not the check that matters here -- it establishes that a
 * token is valid, not that it is this one, and every driver in the app holds a
 * valid one -- so the caller is compared against the service key, and the
 * comparison does not stop at the first wrong byte.
 */
export function sameSecret(given: string, wanted: string): boolean {
  if (!given || !wanted || given.length !== wanted.length) return false;
  let differences = 0;
  for (let at = 0; at < given.length; at += 1) {
    differences |= given.charCodeAt(at) ^ wanted.charCodeAt(at);
  }
  return differences === 0;
}

/** The `Authorization: Bearer <token>` of a request, or an empty string. */
export function bearerOf(header: string | null): string {
  const match = /^Bearer\s+(.+)$/i.exec((header ?? "").trim());
  return match ? match[1].trim() : "";
}

/**
 * What the run did, in the log of whoever has to trust it.
 *
 * English, unlike `receiptLines` in lib/privacy.ts, and for the same reason
 * that one is Romanian: this is read by whoever operates the project, in a
 * function log; the receipt in the app is read by the person the promise was
 * made to.
 *
 * What did not happen is said as loudly as what did. A retention job that logs
 * "0 photographs removed" on a night when storage was refusing calls looks
 * exactly like a quiet night, and telling those two apart is most of the
 * reason for running it at all.
 */
export function runLines(run: RetentionRun): string[] {
  const plural = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;
  const lines: string[] = [];

  if (run.photos_removed > 0) {
    lines.push(`${plural(run.photos_removed, "photograph", "photographs")} removed.`);
  }
  if (run.reports_touched > 0) {
    lines.push(
      `${plural(run.reports_touched, "report", "reports")} had expired photo paths cleared.`,
    );
  }
  if (run.erasures_finished > 0) {
    lines.push(`${plural(run.erasures_finished, "erasure", "erasures")} finished.`);
  }
  if (run.photos_left > 0) {
    lines.push(
      `${plural(run.photos_left, "photograph", "photographs")} could not be removed, and will be tried again.`,
    );
  }
  if (run.erasures_incomplete > 0) {
    lines.push(
      `${plural(run.erasures_incomplete, "erasure", "erasures")} left open: the pictures are still there, so the login stays.`,
    );
  }
  if (!lines.length) lines.push("Nothing was due.");

  return lines;
}
