/**
 * The third of every retention rule that Postgres cannot do itself.
 *
 * Deployed with `supabase functions deploy retention` and called once a night
 * by `0013_retention_jobs.sql`. Two jobs and a look back, each step in an order
 * that only works one way round:
 *
 *   1. EXPIRED EVIDENCE. `evidence_past_retention()` names the photographs of
 *      reports older than twelve months, the storage API deletes the files,
 *      and `forget_evidence_paths` clears exactly those paths afterwards.
 *   2. UNFINISHED ERASURES. `pending_erasures()` names the people whose rows
 *      are gone and whose pictures and login are not. `forget_everything` is
 *      run again over each of them, the bucket under their prefix is emptied,
 *      the `auth.users` row goes through the admin API, and `finish_erasure`
 *      closes the request. The repeat is not belt and braces: see the second
 *      pass in `0014` for the millisecond it exists to cover, and for why a
 *      spot that survives it stops the login from ever being deleted.
 *   3. ERASURES ALREADY FINISHED. `finished_erasures()` names the ones whose
 *      prefix has not yet been quiet for three nights, and lists them again,
 *      because an upload is authorised when it starts and no policy can refuse
 *      one that was permitted before the request. Anything found is deleted and
 *      counted on its own, since it means a promise was briefly untrue.
 *
 * WHY IT RUNS HERE. It needs the service key -- deleting bytes and deleting a
 * login are both privileged HTTP -- and the key is the one credential in this
 * project that can read every report, every plate and every photograph in the
 * city. Inside a Supabase function it is an environment variable on Supabase's
 * own machines, injected by the platform and never written down anywhere else.
 * The alternative that was considered and rejected was a scheduled job on CI
 * holding the key as a repository secret, which puts a copy of the master key
 * to everybody's data in a second company's vault to save writing this file.
 *
 * The caller has to present that same key: `0013` reads it out of Vault under
 * `service_role_key` and this checks it against the one the platform injected.
 * If the two ever differ the call is refused rather than half-trusted, which
 * is a loud way to find out that somebody rotated one of them.
 *
 * WHY IT IS ONE ENDPOINT AND NOT TWO. Both jobs delete files from the same
 * bucket, and running them at once means one call, one log line and no chance
 * of the pair drifting onto different schedules. Both continue past each
 * other's failures: the response says what did not happen rather than the
 * first thing that went wrong, because a night where one report's photographs
 * refuse to delete is not a night to leave every erasure unfinished.
 *
 * WHAT IT NEVER DOES. It has no path that takes an id from the caller. It does
 * delete reports, spots and parkings, but only through `forget_everything`, and
 * only for a uuid that `pending_erasures()` handed it -- that is, for somebody
 * who asked. Everything else it touches was named by a function in the schema,
 * so the worst a stolen call can do is hurry along work the database had
 * already decided was due.
 */

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

import {
  EVIDENCE_PAGE,
  LIST_PAGE,
  PHOTO_BUCKET,
  REMOVE_BATCH,
  bearerOf,
  chunk,
  emptyRun,
  keepSweeping,
  loginMayGo,
  pathsUnder,
  runLines,
  sameSecret,
  type ExpiredPhoto,
  type RetentionRun,
  type StorageEntry,
} from "../_shared/retention.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (request: Request) => {
  if (!sameSecret(bearerOf(request.headers.get("Authorization")), serviceKey)) {
    /* No detail, on purpose. "Wrong key" and "no key" are the same answer to
       somebody probing, and the two states worth telling apart are in the
       function's own log rather than in the reply. */
    console.warn("Refused a call without the service key");
    return new Response("Not for you", { status: 401 });
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const run = emptyRun();
  const failures: string[] = [];

  await expireEvidence(supabase, run, failures);
  await finishErasures(supabase, run, failures);
  await recheckFinishedErasures(supabase, run, failures);

  const lines = runLines(run);
  for (const line of lines) console.log(line);
  for (const failure of failures) console.error(failure);

  /* 200 even when something failed. The caller is `net.http_post` from pg_cron,
     which cannot do anything with a 500 except write it in a table nobody
     reads; the run is a report, and what went wrong is in it. */
  return Response.json({ ...run, lines, failures });
});

/**
 * Photographs of reports past twelve months, and the paths that named them.
 *
 * A page at a time, and each page is deleted and cleared before the next is
 * asked for. There is no offset: a cleared path is not returned again, so the
 * next page is the first page, and a run that dies halfway through leaves a
 * shorter list rather than a lost place in a longer one.
 *
 * The clearing is by path (`forget_evidence_paths`), which is what makes the
 * paging safe. Clearing by report -- `forget_evidence` in `0009` -- would
 * blank the whole array on the strength of whichever half of a report happened
 * to fit in the page, and the other half's files would stay in the bucket with
 * nothing naming them.
 */
async function expireEvidence(
  supabase: SupabaseClient,
  run: RetentionRun,
  failures: string[],
): Promise<void> {
  for (let pass = 0; ; pass += 1) {
    const { data, error } = await supabase
      .rpc("evidence_past_retention")
      .limit(EVIDENCE_PAGE);
    if (error) {
      failures.push(`Could not ask what evidence is past retention: ${error.message}`);
      return;
    }

    const expired = (data ?? []) as ExpiredPhoto[];
    if (!expired.length) return;

    let cleared = 0;
    for (const batch of chunk(expired.map((photo) => photo.path), REMOVE_BATCH)) {
      const { data: removed, error: gone } = await supabase.storage
        .from(PHOTO_BUCKET)
        .remove(batch);
      if (gone) {
        run.photos_left += batch.length;
        failures.push(`Could not remove ${batch.length} photographs: ${gone.message}`);
        continue;
      }
      /* What storage says it deleted, not what was asked for. The two differ
         for a path whose file had already gone, and counting the ask would
         report deletions that never happened to whoever reads this as proof
         that retention is running. */
      run.photos_removed += removed?.length ?? 0;

      const { data: touched, error: forgot } = await supabase.rpc(
        "forget_evidence_paths",
        { gone: batch },
      );
      if (forgot) {
        /* The files are gone and the paths are not, which the app already
           survives: `signEvidence` drops a path storage will not sign, and the
           next pass finds the same rows and asks again. Loud, because the
           opposite order -- paths cleared, files kept -- is the one that
           cannot be repaired. */
        failures.push(`Removed the files but could not clear the paths: ${forgot.message}`);
        continue;
      }
      cleared += batch.length;
      run.reports_touched += typeof touched === "number" ? touched : 0;
    }

    if (!keepSweeping(cleared, pass)) return;
  }
}

/**
 * The people whose rows are gone and whose pictures and login are not.
 *
 * One at a time, and each one either completes or stays open. There is no
 * halfway state to record: `erasure_requests` has a `completed_at` and nothing
 * finer, because "we deleted most of your photographs" is not a thing anybody
 * would want written down about them.
 */
async function finishErasures(
  supabase: SupabaseClient,
  run: RetentionRun,
  failures: string[],
): Promise<void> {
  const { data, error } = await supabase.rpc("pending_erasures");
  if (error) {
    failures.push(`Could not read the pending erasures: ${error.message}`);
    return;
  }

  const pending = (data ?? []) as {
    user_id: string;
    storage_prefix: string | null;
  }[];

  for (const request of pending) {
    /* The second pass. `erase_me` deleted these rows hours ago; anything here
       now arrived in the window between the request being written and it
       becoming visible to the policies that refuse writes -- see the header of
       `0014`. Rows before files, because a report deleted here leaves its
       photographs to the sweep below, and before the login for a harder
       reason: a `private_property` spot that outlived `erase_me` makes the
       `auth.users` delete violate `spots_property_has_an_owner`, and the
       erasure would then fail every night for good. */
    const { error: leftovers } = await supabase.rpc("forget_everything", {
      who: request.user_id,
    });
    if (leftovers) {
      failures.push(
        `Could not re-run the deletions for ${request.user_id}: ${leftovers.message}`,
      );
      run.erasures_incomplete += 1;
      continue;
    }

    const prefix = request.storage_prefix ?? `${request.user_id}/`;
    const swept = await emptyPrefix(supabase, prefix, failures);
    run.photos_removed += swept.removed;
    run.photos_left += swept.left;

    if (!loginMayGo(swept.left)) {
      run.erasures_incomplete += 1;
      continue;
    }

    const { error: login } = await supabase.auth.admin.deleteUser(request.user_id);
    /* Already gone counts as gone: a run that died between the delete and the
       receipt would otherwise leave a request that can never be closed. */
    if (login && login.status !== 404) {
      failures.push(`Could not delete the login ${request.user_id}: ${login.message}`);
      run.erasures_incomplete += 1;
      continue;
    }

    const { error: receipt } = await supabase.rpc("finish_erasure", {
      wanted: request.user_id,
    });
    if (receipt) {
      failures.push(`Deleted everything but could not close the request: ${receipt.message}`);
      run.erasures_incomplete += 1;
      continue;
    }
    run.erasures_finished += 1;
  }
}

/**
 * Look again at the prefixes of erasures that are already closed.
 *
 * The last line of the argument that runs through `0014`. A storage request is
 * authorised when it starts, so an upload begun a minute before its token
 * expired can still be arriving while the sweep above is listing, and land
 * after the request was closed. Three hours makes that need a deliberate
 * hour-long upload rather than an accident; it cannot make it impossible,
 * because nothing here can refuse a permission that was already given.
 *
 * What it can do is look again the next night, and the one after. Anything
 * found is deleted and counted apart from the ordinary sweep: `erase_me` has
 * already told somebody their photographs were gone, and a file under that
 * prefix means the sentence was wrong for a while. `runLines` says so in as
 * many words rather than folding it into a total.
 *
 * The watch ends by counting quiet nights rather than by a date, and
 * `finished_erasures` in `0014` gives the argument: a window of time is only a
 * window if the job runs, and an outage longer than it would let everything
 * closed beforehand age out unlooked-at. So a night that finds nothing is
 * recorded and a night that finds something starts the count again -- and a
 * night that could not look is neither, which is why the recording is skipped
 * rather than guessed when the listing failed.
 *
 * Failures here are not counted against the erasure. It is finished; this is a
 * check on whether it stayed finished, and a storage API refusing to list
 * tonight is a reason to look again tomorrow, not a reason to reopen a
 * request that was honoured.
 */
async function recheckFinishedErasures(
  supabase: SupabaseClient,
  run: RetentionRun,
  failures: string[],
): Promise<void> {
  const { data, error } = await supabase.rpc("finished_erasures");
  if (error) {
    failures.push(`Could not read the finished erasures: ${error.message}`);
    return;
  }

  const finished = (data ?? []) as {
    user_id: string;
    storage_prefix: string | null;
  }[];

  for (const request of finished) {
    const prefix = request.storage_prefix ?? `${request.user_id}/`;
    const late = await emptyPrefix(supabase, prefix, failures);
    run.photos_after_the_end += late.removed;
    run.photos_left += late.left;

    /* `left` is what a fresh listing found, and a listing that failed answers
       "something" -- see `emptyPrefix`. So this is exactly the case where the
       night can be called quiet, and every other case leaves the count alone
       for a night that can answer properly. */
    if (late.left > 0) continue;

    const { error: noted } = await supabase.rpc("record_a_recheck", {
      whose: request.user_id,
      anything_found: late.removed > 0,
    });
    if (noted) {
      failures.push(`Looked at ${prefix} but could not write down that it went: ${noted.message}`);
    }
  }
}

/**
 * Delete everything under a prefix, then look again.
 *
 * Walked rather than queried, because by the time this runs the rows that held
 * the paths are gone -- that is the whole reason `erase_me` writes the prefix
 * down. Breadth-first over `<uid>/` and then each report folder under it, with
 * every page asked for until one comes back short.
 *
 * The second walk is the point. "The deletes returned no error" is not the
 * same claim as "the folder is empty": a file uploaded while the sweep was
 * running never appeared in the first listing, and `0013` closes that door for
 * new sessions while leaving it open for a token minted before the erasure.
 * So the answer this returns is what a fresh listing found, and a listing that
 * failed answers "something", because not knowing is not the same as nothing.
 */
async function emptyPrefix(
  supabase: SupabaseClient,
  prefix: string,
  failures: string[],
): Promise<{ removed: number; left: number }> {
  const found = await filesUnder(supabase, prefix, failures);
  if (found === null) return { removed: 0, left: 1 };

  let removed = 0;
  for (const batch of chunk(found, REMOVE_BATCH)) {
    const { data, error } = await supabase.storage.from(PHOTO_BUCKET).remove(batch);
    if (error) {
      failures.push(`Could not remove ${batch.length} files under ${prefix}: ${error.message}`);
      continue;
    }
    removed += data?.length ?? 0;
  }

  const left = await filesUnder(supabase, prefix, failures);
  if (left === null) return { removed, left: 1 };
  return { removed, left: left.length };
}

/**
 * Every file under a prefix, or null if the bucket would not say.
 *
 * Null rather than an empty list, and the distinction is the one this whole
 * function exists to preserve: an empty list deletes somebody's account.
 */
async function filesUnder(
  supabase: SupabaseClient,
  prefix: string,
  failures: string[],
): Promise<string[] | null> {
  const queue = [prefix];
  const files: string[] = [];

  while (queue.length) {
    const folder = queue.shift() as string;
    for (let offset = 0; ; offset += LIST_PAGE) {
      const { data, error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .list(folder.replace(/\/+$/, ""), { limit: LIST_PAGE, offset });
      if (error) {
        failures.push(`Could not list ${folder}: ${error.message}`);
        return null;
      }
      const page = (data ?? []) as StorageEntry[];
      const under = pathsUnder(folder, page);
      files.push(...under.files);
      queue.push(...under.folders);
      if (page.length < LIST_PAGE) break;
    }
  }

  return files;
}
