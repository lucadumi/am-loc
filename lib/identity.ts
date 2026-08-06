/**
 * Who this device writes as.
 *
 * With no project configured that is the string `"me"`, and everything filed
 * from this phone carries it. With one, it is a uuid in `auth.users`, and the
 * app cannot know it without asking the server.
 *
 * The asking is asynchronous and the question is not. `isMine(report)` is
 * called while a list is rendering, once per row, to decide whether to offer
 * the buttons that correct or withdraw it — and an answer that arrives a tick
 * later would mean every report a driver filed reads as somebody else's for
 * the first frame, then quietly grows an edit button. So the id is resolved
 * when the data is loaded and remembered here, and the synchronous question
 * has a synchronous answer.
 *
 * The dynamic import is the usual reason: `lib/supabase.ts` pulls in
 * `@supabase/supabase-js`, the URL polyfill and an auth session, none of which
 * should load on a device that has no project.
 */

import { isRemote } from "./remote.ts";
import { LOCAL_REPORTER_ID } from "./spot-reports.ts";

let cached: string = LOCAL_REPORTER_ID;

/** The id this device files under, as last resolved. Never throws, never waits. */
export function currentIdentity(): string {
  return cached;
}

/**
 * Ask the server who we are, and remember it.
 *
 * Signs in anonymously if there is nobody yet, which is the same thing any
 * write would have done; doing it on a read means the app knows whose reports
 * are whose before it has to draw them.
 */
export async function resolveIdentity(): Promise<string> {
  if (!isRemote()) return LOCAL_REPORTER_ID;
  const { currentReporterId } = await import("./supabase.ts");
  cached = await currentReporterId();
  return cached;
}
