/**
 * Who a person is to this app, and what that entitles them to.
 *
 * The client half of `0008_accounts_and_roles.sql`, and a deliberate copy of
 * the rule in `has_role` rather than a call to it. Both are needed and they
 * answer different questions: Postgres decides what a request is *allowed* to
 * do, this decides what the app should *offer*. A screen that has to await a
 * round trip before it knows whether to draw a button draws the wrong one
 * first, and an app that only learns it is not allowed by being refused shows
 * a driver a failure where it should have shown them nothing at all.
 *
 * The copy is safe in the direction that matters. If the two ever disagree the
 * database wins, and the worst outcome is a button that errors -- never a
 * permission the client grants itself, because nothing here is trusted by
 * anything on the server.
 *
 * Pure, with no runtime imports at all, so `node --test` loads it.
 */

import type { Account, AccountRole } from "@/types";

/* Re-exported so a screen reasoning about permissions imports one module
   rather than two, and so `@/types` stays the leaf it is everywhere else. */
export type { Account, AccountRole, AssuranceLevel } from "@/types";

/**
 * The roles somebody is given, as opposed to the one they have by existing.
 *
 * `user` is absent on purpose: everybody signed in is a user, so a grant
 * saying so would carry no information and its absence would be ambiguous.
 * The database enforces the same thing with a check constraint.
 */
export const ACCOUNT_GRANTS = ["host", "resolver", "admin"] as const;

/**
 * The roles that act on somebody else's data.
 *
 * The line is blast radius, not seniority. A host acts on their own property
 * and can hurt only themselves; a resolver reads number plates belonging to
 * strangers and closes their complaints. These are the two a stolen phone must
 * not be enough to use.
 */
export const PRIVILEGED_ROLES = ["resolver", "admin"] as const;

/** Whether a role carries authority over other people's data. */
export function isPrivileged(role: AccountRole): boolean {
  return (PRIVILEGED_ROLES as readonly AccountRole[]).includes(role);
}

/** What a driver is before they have signed up, and with no project configured. */
export function anonymousAccount(id: string): Account {
  return {
    id,
    anonymous: true,
    grants: [],
    assurance: "aal1",
    hasSecondFactor: false,
    passwordPending: false,
    trader: false,
  };
}

/**
 * Whether this account, on this session, may act as a role.
 *
 * The whole rule in one expression, mirroring `has_role` in SQL line for line.
 * Three things have to be true, and the last two are the point:
 *
 *   1. The grant exists.
 *   2. The session is not anonymous.
 *   3. For a privileged role, the session has passed a second factor -- the
 *      *session*, not the account. Somebody who enrolled a factor and then
 *      signed in with only a password is at `aal1`, and the entire value of
 *      the requirement is that a stolen password is not enough at the moment
 *      the request is made.
 */
export function holds(account: Account, role: AccountRole): boolean {
  if (role === "user") return true;
  if (account.anonymous) return false;
  if (!account.grants.includes(role)) return false;
  return !isPrivileged(role) || account.assurance === "aal2";
}

/** Every role this session may actually act as, `user` included. */
export function effectiveRoles(account: Account): AccountRole[] {
  return (["user", ...ACCOUNT_GRANTS] as AccountRole[]).filter((role) =>
    holds(account, role),
  );
}

/**
 * A grant this session cannot use until a second factor is passed.
 *
 * The reason `grants` is stored rather than filtered on the way in. A resolver
 * who signs in with a password has a role and cannot use it, and the honest
 * thing to show them is a prompt to finish signing in -- not a screen with the
 * resolver tools missing, which is indistinguishable from having been removed.
 */
export function blockedByAssurance(account: Account): AccountRole[] {
  if (account.anonymous || account.assurance === "aal2") return [];
  return account.grants.filter(isPrivileged);
}

/** Whether the app should be asking this person for a second factor. */
export function needsSecondFactor(account: Account): boolean {
  return blockedByAssurance(account).length > 0;
}

/**
 * Whether a challenge is what this session needs, rather than an enrolment.
 *
 * Asked by everybody, not only by those holding a privileged grant, and that
 * is the point. A factor is enrolled once and challenged at every sign-in, so
 * an ordinary driver who turned two-step on last week arrives here at `aal1`
 * with nothing suspended and no reason for the app to notice — and offering
 * them "add an authenticator" is both wrong and refused by the server, which
 * will not enrol a second factor from a session that has not passed the first.
 */
export function canPassSecondFactor(account: Account): boolean {
  return (
    !account.anonymous && account.hasSecondFactor && account.assurance !== "aal2"
  );
}

/**
 * Whether there is a second factor to set up at all.
 *
 * The other side of `canPassSecondFactor`, so that a screen drawing one of
 * three states -- enrol, confirm, done -- cannot accidentally draw two.
 */
export function canEnrolSecondFactor(account: Account): boolean {
  return !account.anonymous && !account.hasSecondFactor;
}

/** Whether they may list a parking space of their own. */
export function mayHost(account: Account): boolean {
  return holds(account, "host");
}

/**
 * Whether they may act on somebody else's complaint.
 *
 * An admin is not silently one of these. Running the project is not the same
 * as being a sector hall, and the grant that lets somebody read a stranger's
 * number plate should be the grant that says so -- an admin who needs to
 * resolve reports is given `resolver` as well, and that grant is a record.
 */
export function mayResolveReports(account: Account): boolean {
  return holds(account, "resolver");
}

/** Whether they may administer the project. */
export function mayAdminister(account: Account): boolean {
  return holds(account, "admin");
}

/**
 * Whether an account is stable enough to be given a role.
 *
 * Asked before offering to become a host. A grant to an anonymous account can
 * never be exercised and can never be revoked by its holder, so the app sends
 * somebody to sign up first rather than granting something that will not work.
 */
export function mayBeGranted(account: Account): boolean {
  return !account.anonymous;
}

/** What each role is called in Romanian. */
export const roleLabel: Record<AccountRole, string> = {
  user: "Șofer",
  host: "Proprietar",
  resolver: "Autoritate",
  admin: "Administrator",
};

/**
 * The one word for who somebody is, when there is only room for one.
 *
 * Highest first, because that is the answer a person is looking for: somebody
 * who is both a warden and a host reads themselves as the warden. Falls back
 * to `user`, which is always true.
 */
export function primaryRole(account: Account): AccountRole {
  const ranked: AccountRole[] = ["admin", "resolver", "host"];
  return ranked.find((role) => holds(account, role)) ?? "user";
}
