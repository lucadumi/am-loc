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
 * The same now applies to what the person is allowed to be. Whether to draw a
 * resolver's buttons is decided during a render, so the account — grants and
 * all — is cached beside the id rather than fetched by whoever needs it.
 *
 * The dynamic import is the usual reason: `lib/supabase.ts` pulls in
 * `@supabase/supabase-js`, the URL polyfill and an auth session, none of which
 * should load on a device that has no project.
 */

import { isRemote } from "./remote.ts";
import { anonymousAccount, type Account } from "./roles.ts";

/**
 * Who this device is before it has an account, and when there is no project.
 *
 * Declared here rather than imported, now that the reporting module it used to
 * live in is gone. Still needed: `mayDeclare` compares an owner id against the
 * current identity, so the offline park-sharing flow has to have one.
 */
export const LOCAL_IDENTITY = "me";

/**
 * The last account resolved, or the offline stand-in.
 *
 * Anonymous with no grants until told otherwise, which is safe in both
 * directions: it permits nothing, and it is what a driver who has never signed
 * up actually is.
 */
let cached: Account = anonymousAccount(LOCAL_IDENTITY);

/** The id this device files under, as last resolved. Never throws, never waits. */
export function currentIdentity(): string {
  return cached.id;
}

/** Who the app is acting as, as last resolved. Never throws, never waits. */
export function currentAccount(): Account {
  return cached;
}

/**
 * Ask the server who we are, and remember it.
 *
 * Signs in anonymously if there is nobody yet, which is the same thing any
 * write would have done; doing it on a read means the app knows whose reports
 * are whose before it has to draw them.
 *
 * Only the id, deliberately. This runs on the path that loads reports, where
 * no role is wanted and a second round trip for one would be paid by every
 * driver on every list. The profile and the grants are `resolveAccount`'s
 * business; an id that turns out to be somebody else invalidates what is
 * cached rather than silently keeping the old person's roles.
 */
export async function resolveIdentity(): Promise<string> {
  if (!isRemote()) return LOCAL_IDENTITY;
  const { currentReporterId } = await import("./supabase.ts");
  const id = await currentReporterId();
  if (id !== cached.id) cached = anonymousAccount(id);
  return id;
}

/**
 * Ask the server who we are and what we may do, and remember it.
 *
 * For the screens that turn on a role. With no project configured it is an
 * anonymous account with no grants, which is the truth rather than a fallback:
 * there is no server to have granted anything, and every capability in
 * `lib/roles.ts` is correctly false for it.
 */
export async function resolveAccount(): Promise<Account> {
  if (!isRemote()) return cached;
  const { loadAccount } = await import("./account.ts");
  cached = await loadAccount();
  return cached;
}

/**
 * Remember an account a sign-in or an edit has just produced.
 *
 * The auth calls in `lib/account.ts` return the account they leave behind, and
 * without this the cache would hold the anonymous one until something happened
 * to reload it — so a driver would sign up successfully and watch the app go
 * on treating them as a guest.
 */
export function rememberAccount(account: Account): Account {
  cached = account;
  return account;
}

/**
 * Forget everything, for a sign-out.
 *
 * Back to the offline stand-in rather than to the previous uuid: with no
 * session, the next write mints or fetches one, and leaving the old id cached
 * would have `isMine` claiming a stranger's reports until it did.
 */
export function forgetAccount(): void {
  cached = anonymousAccount(LOCAL_IDENTITY);
}
