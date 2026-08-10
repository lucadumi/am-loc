/**
 * Signing up, signing in, and the second factor.
 *
 * The seam between `lib/roles.ts`, which knows what a role means, and Supabase
 * Auth, which knows who is holding the phone. Loaded only when a project is
 * configured: `lib/identity.ts` reaches it through a dynamic import for the
 * same reason everything else in the data layer does, so that a build with no
 * credentials never pulls in `@supabase/supabase-js` or the URL polyfill.
 *
 * ---
 *
 * WHY SIGNING UP KEEPS EVERYTHING, which is the point of the whole feature.
 *
 * `updateUser({ email })` does not create a second user. It attaches an
 * address to the anonymous row that already exists, and `auth.users.id` is
 * untouched -- so `reports.created_by`, `spots.owner_id`,
 * `availability_windows.owner_id` and every path under `report-photos/<uuid>/`
 * keep pointing at the same person. There is no copying step here because
 * there is nothing to copy, and that is the design rather than a convenience:
 * any scheme that minted a new uuid at sign-up would have to rewrite six
 * tables and a bucket, and would quietly orphan whatever it forgot.
 *
 * WHY IT TAKES TWO STEPS. Supabase will not set a password on an account whose
 * email has not been confirmed, and confirming means a code arriving in an
 * inbox. Doing it in one call is possible and leaves a failure mode this app
 * cannot afford: the address is stored, the password is not, and a driver who
 * closes the app believes they have an account they cannot sign into. So
 * `startSignUp` sends the code, `finishSignUp` verifies it and sets the
 * password in the same breath, and until the second one returns the account is
 * exactly what it was.
 *
 * The verification type is `email_change` rather than `signup`, which reads
 * oddly and is right: from Supabase's side nobody is signing up. The user has
 * existed since their first read; what is changing is the address on it.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { forgetAccount, rememberAccount } from "./identity.ts";
import type { Account, AssuranceLevel } from "./roles.ts";
import { SupabaseError, currentReporterId, supabase } from "./supabase.ts";
import type { ProfileRow, ProfileUpdate, UserRoleRow } from "@/types/database.ts";

function client(): SupabaseClient {
  const supabaseClient = supabase();
  if (!supabaseClient) {
    throw new Error("lib/account.ts loaded without a configured project");
  }
  return supabaseClient;
}

/**
 * Read the account back and put it in the cache the screens read from.
 *
 * Every call below that changes who the app is ends with this rather than
 * returning what it happens to know. `currentAccount()` is answered
 * synchronously during a render, so an account that changed without the cache
 * being told would leave a driver signed in and still being called a guest —
 * and the reload is what picks up the parts of the answer the caller could not
 * have computed, such as the `aal2` a challenge has just put in the token.
 */
async function remember(): Promise<Account> {
  return rememberAccount(await loadAccount());
}

/**
 * Whose sign-up got as far as an address and no further.
 *
 * THE HALF-STATE THIS EXISTS TO CLOSE. Attaching an email and setting a
 * password are two round trips and Supabase insists on that order, so there is
 * a window between them. If the second one does not land -- a dropped
 * connection, a password the project's policy rejects, a rate limit -- the
 * account ends up with an address and no password, which is worse than either
 * end of the journey: `is_anonymous` is now false, so the app would stop
 * treating it as a temporary account, and `signOut` would stop refusing. One
 * tap on "Ieși din cont" would then strand the reports under a uuid nobody can
 * ever authenticate as, which is the exact outcome the whole feature exists to
 * prevent.
 *
 * So the intention is written down before the address is, and cleared only
 * once a password exists. Anything that finds it set knows to finish the job
 * rather than to start again -- and `signOut` keeps refusing until it is gone.
 *
 * On the device rather than in a table, because it is a fact about an
 * interrupted flow on this phone, not about the person: somebody who abandons
 * a sign-up here and completes one on another phone has nothing to resume.
 */
const PENDING_PASSWORD_KEY = "amloc.signup-password-pending.v1";

/** The uuid whose sign-up is half done on this device, if any. */
async function pendingPasswordFor(): Promise<string | null> {
  return AsyncStorage.getItem(PENDING_PASSWORD_KEY);
}

async function markPasswordPending(id: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_PASSWORD_KEY, id);
}

async function clearPasswordPending(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_PASSWORD_KEY);
}

/**
 * Whether a user row still has no way back into itself.
 *
 * `is_anonymous` is the authority and older tokens predate it, so an account
 * with an email on it is taken to be signed up either way. Erring towards
 * "signed up" is the safe direction for the one thing this flag gates in the
 * client: it decides whether to *offer* a role, and the database refuses one
 * to an anonymous account regardless of what this returns.
 */
function isAnonymousUser(user: User): boolean {
  return user.is_anonymous === true && !user.email;
}

/** What the session's token says about how strongly it is authenticated. */
async function assuranceOf(supabaseClient: SupabaseClient): Promise<AssuranceLevel> {
  const { data } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.currentLevel === "aal2" ? "aal2" : "aal1";
}

/**
 * Everything the app needs to know about who it is acting as.
 *
 * The profile and the grants are read in one round trip beside each other
 * because both are wanted at once by every caller, and a screen that got them
 * separately would render as an ordinary driver for a frame and then grow a
 * resolver's buttons.
 *
 * A missing profile row is not an error. The trigger in
 * `0008_accounts_and_roles.sql` creates one for every account, but a project
 * that has not run the migration yet is a project this app should still open
 * on -- so an absent row reads as a profile nobody has filled in.
 */
export async function loadAccount(): Promise<Account> {
  const supabaseClient = client();
  const id = await currentReporterId();

  const [{ data: session }, assurance, pending, profile, grants] = await Promise.all([
    supabaseClient.auth.getUser(),
    assuranceOf(supabaseClient),
    pendingPasswordFor(),
    supabaseClient
      .from("profiles")
      .select("display_name, is_trader, created_at")
      .eq("id", id)
      .returns<Pick<ProfileRow, "display_name" | "is_trader" | "created_at">[]>()
      .maybeSingle(),
    /* Scoped to this account, and not merely for tidiness: an admin's select
       policy returns every grant in the project, so an unfiltered query would
       have the app believe an administrator held every role anybody had. */
    supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", id)
      .returns<Pick<UserRoleRow, "role">[]>(),
  ]);

  /* Neither query's error is raised, and the direction is deliberate: a
     profile that cannot be read reads as one nobody has filled in, and grants
     that cannot be read read as none. Both fail closed -- the app offers less
     than the person is entitled to rather than more -- and the alternative is
     a profile screen that refuses to open at all because one of two optional
     rows was unavailable. */
  const user = session.user;
  return {
    id,
    anonymous: user ? isAnonymousUser(user) : true,
    /* Read off the user rather than from `mfa.listFactors()`, which would be a
       second round trip for something already in hand. What it decides is
       which control the profile screen draws: somebody who enrolled an
       authenticator last week and signed in with a password today needs to be
       offered the challenge, not an "add" button that Supabase refuses because
       a verified factor already exists. */
    hasSecondFactor: (user?.factors ?? []).some(
      (factor) => factor.status === "verified",
    ),
    /* Only ours. A marker left by a sign-up that was abandoned and then
       completed as a different account would otherwise ask this one for a
       password it already has. */
    passwordPending: pending !== null && pending === id,
    /* Every grant, including the ones this session may not use. `holds` in
       lib/roles.ts applies the second-factor rule; filtering here instead
       would make a resolver at aal1 look like somebody whose role had been
       taken away. */
    grants: (grants.data ?? []).map((row) => row.role),
    assurance,
    ...(user?.email ? { email: user.email } : {}),
    ...(profile.data?.display_name
      ? { displayName: profile.data.display_name }
      : {}),
    ...(profile.data?.created_at ? { since: profile.data.created_at } : {}),
    trader: profile.data?.is_trader ?? false,
  };
}

// ---------------------------------------------------------------------------
// Signing up
// ---------------------------------------------------------------------------

/**
 * Attach an email to this device's account and send a confirmation code.
 *
 * Nothing is lost if the driver never types the code: they stay anonymous,
 * with the same uuid and the same reports, and may try again with a different
 * address. Signing in as somebody else is the only act that walks away from an
 * anonymous account, and `signIn` says so.
 */
export async function startSignUp(email: string): Promise<Account> {
  // Makes sure there is a user to attach the address to. A driver who has only
  // ever browsed has no session yet, and `updateUser` on nobody fails with an
  // error about the session rather than about the account.
  const id = await currentReporterId();

  /* Whether a sign-up was already under way before this call. It decides what
     the failure path below is allowed to undo, and it has to be read before
     the marker is written or it would always say yes. */
  const resuming = (await pendingPasswordFor()) === id;

  /* Before the address, not after. On a project with email confirmation
     switched off the next line takes effect immediately and no code is ever
     sent, so a marker written afterwards would already be too late to describe
     what happened. */
  await markPasswordPending(id);

  const { error } = await client().auth.updateUser({ email: email.trim() });
  if (error) {
    /* ONLY UNDO WHAT THIS CALL DID. This is also the "resend the code" button,
       so it is reached from a sign-up already in progress -- including one
       whose address is confirmed and whose password call failed, which is
       precisely the half-finished account the marker exists to describe.
       Clearing it there would put the account back to looking finished while
       having no password, and re-arm the sign-out that strands the reports.
       A marker this call did not create is therefore left exactly where it
       was; the worst case is one left on an account that never attached an
       address, which routes to the same form and is refused a sign-out anyway
       for still being anonymous. */
    if (!resuming) await clearPasswordPending();
    throw new SupabaseError("Nu am putut trimite codul", error);
  }
  return remember();
}

/**
 * Confirm the address, if it still needs confirming, and set a password.
 *
 * That order is not stylistic: Supabase refuses a password on an unconfirmed
 * address, so setting the password first would leave the driver confirmed and
 * passwordless.
 *
 * RESUMABLE, WHICH IS THE WHOLE POINT OF THE FIRST BRANCH. A confirmation code
 * is single use. If the password call failed the first time round — and it is
 * the likelier of the two to, because the project's password policy is
 * enforced there — then retrying the pair would re-spend a token that has
 * already been spent, and the driver would be told forever that a code they
 * copied correctly is invalid. So the confirmation is skipped when it has
 * already happened, and this becomes a plain "set your password" call.
 *
 * The same branch covers a project with email confirmation switched off, where
 * the address lands immediately and no code is ever sent: there is nothing to
 * confirm, so nothing is asked for.
 */
export async function finishSignUp(
  email: string,
  code: string,
  password: string,
): Promise<Account> {
  const supabaseClient = client();

  const { data: before } = await supabaseClient.auth.getUser();
  if (!before.user || isAnonymousUser(before.user)) {
    const verified = await supabaseClient.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      // Not `signup`. From the server's side nobody is signing up: this user
      // has existed since their first read, and what is changing is the
      // address on it.
      type: "email_change",
    });
    if (verified.error) {
      throw new SupabaseError("Codul nu este valid", verified.error);
    }
  }

  const { error } = await supabaseClient.auth.updateUser({ password });
  /* The marker stays put on a failure, deliberately. It is what keeps
     `signOut` refusing and what tells the profile screen to ask for a password
     rather than to draw a finished account. */
  if (error) throw new SupabaseError("Nu am putut salva parola", error);

  await clearPasswordPending();
  return remember();
}

// ---------------------------------------------------------------------------
// Signing in and out
// ---------------------------------------------------------------------------

/**
 * Sign in on a device that is already somebody.
 *
 * THIS IS THE ONE ACT THAT ABANDONS AN ANONYMOUS ACCOUNT, and it does so
 * silently as far as Postgres is concerned: the anonymous user keeps owning
 * its reports, and nobody can ever prove they are it again. So the caller is
 * made to say it means to -- `abandoning` is not a confirmation dialog moved
 * into the data layer, it is the fact that the screen has to have asked in
 * order to pass it.
 *
 * The reports do not disappear from the app; they stop being editable, because
 * `isMine` compares against the identity that is now signed in. That is the
 * correct outcome and it is not an obvious one, which is why it is written
 * down here and told to the driver on screen.
 */
export async function signIn(
  email: string,
  password: string,
  options: { abandoning?: boolean } = {},
): Promise<Account> {
  const supabaseClient = client();

  const { data: session } = await supabaseClient.auth.getUser();
  if (session.user && isAnonymousUser(session.user) && !options.abandoning) {
    throw new Error(
      "Ai deja o activitate salvată pe acest telefon. Confirmă că vrei să intri în alt cont.",
    );
  }

  const { error } = await supabaseClient.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw new SupabaseError("Nu am putut intra în cont", error);
  /* Whoever just signed in has a password by definition, and any half-finished
     sign-up on this device belonged to the account that was abandoned. */
  await clearPasswordPending();
  return remember();
}

/**
 * Sign out, and refuse to when there is nothing to sign back into.
 *
 * An anonymous session is the only copy of that account's existence. Signing
 * out of one does not clear a login, it destroys a person: the reports stay in
 * the table, owned by a uuid nobody can ever authenticate as again.
 *
 * TWO WAYS TO BE UNRECOVERABLE, AND ONLY ONE OF THEM IS ANONYMITY. An account
 * halfway through signing up has an address and no password, so it reads as a
 * real account by every other test in this module — and there is still nothing
 * to sign back in with, because the app only offers `signInWithPassword`. Both
 * are refused here rather than only in the screen, because the screen is the
 * thing that can be rewritten by somebody who has not read this comment.
 */
export async function signOut(): Promise<void> {
  const supabaseClient = client();
  const { data: session, error: unread } = await supabaseClient.auth.getUser();

  /* FAIL CLOSED ON THE READ, which is the difference between a guard and a
     decoration. `getUser` is a network call and answers `{ user: null }` on any
     transport failure rather than falling back to the stored user -- so a check
     written as `session.user && ...` is a check that a tunnel switches off,
     and auth-js drops the local session before returning most errors, so there
     would be no second chance. Refusing to sign out while offline costs a
     driver a minute; the other way round costs them every report they filed. */
  if (unread || !session.user) {
    throw new Error(
      "Nu pot verifica contul acum. Încearcă din nou când ai semnal.",
    );
  }

  if (isAnonymousUser(session.user)) {
    throw new Error(
      "Nu poți ieși dintr-un cont fără email: activitatea de pe acest telefon nu ar mai putea fi recuperată.",
    );
  }
  if ((await pendingPasswordFor()) === session.user.id) {
    throw new Error(
      "Termină de făcut contul mai întâi: fără parolă nu ai cum să intri înapoi.",
    );
  }

  const { error } = await supabaseClient.auth.signOut();
  if (error) throw new SupabaseError("Nu am putut ieși din cont", error);
  await clearPasswordPending();
  forgetAccount();
}

// ---------------------------------------------------------------------------
// The profile
// ---------------------------------------------------------------------------

/**
 * Save what a person says about themselves.
 *
 * Only the two fields, because only two are theirs. `trader_declared_at` is
 * stamped by a trigger and `updated_at` with it, so a client that sent either
 * would be telling the database something it is about to overwrite.
 */
export async function saveProfile(patch: ProfileUpdate): Promise<Account> {
  const id = await currentReporterId();
  const { error } = await client().from("profiles").update(patch).eq("id", id);
  if (error) throw new SupabaseError("Nu am putut salva profilul", error);
  return remember();
}

// ---------------------------------------------------------------------------
// The second factor
// ---------------------------------------------------------------------------

/** A factor waiting to be confirmed: what to show, and what to confirm against. */
export interface SecondFactorEnrolment {
  factorId: string;
  /** The `otpauth://` URI, for an authenticator app or a QR code. */
  uri: string;
  /** The shared secret in the form a person can type by hand. */
  secret: string;
}

/**
 * Begin enrolling an authenticator app.
 *
 * Offered to anybody, not only to those who already hold a privileged role,
 * and the ordering matters: a sector hall cannot pass a challenge for a factor
 * they were not allowed to enrol until after they were granted the role, which
 * would make every fresh resolver grant unusable until somebody talked them
 * through it.
 *
 * An abandoned enrolment leaves an unverified factor behind, and a second
 * attempt would otherwise fail on the friendly name already being taken. So an
 * unverified one is cleared first: nothing depends on it, because a factor
 * only counts once it has been verified.
 */
export async function enrolSecondFactor(): Promise<SecondFactorEnrolment> {
  const supabaseClient = client();

  const existing = await supabaseClient.auth.mfa.listFactors();
  for (const factor of existing.data?.all ?? []) {
    if (factor.status !== "verified") {
      await supabaseClient.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabaseClient.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "AmLoc",
  });
  if (error || !data) {
    throw new SupabaseError("Nu am putut porni autentificarea în doi pași", error);
  }
  return { factorId: data.id, uri: data.totp.uri, secret: data.totp.secret };
}

/**
 * Confirm the code from the authenticator, which also raises this session to
 * `aal2`.
 *
 * Both halves matter. Verifying is what makes the factor real for every future
 * sign-in, and passing the challenge is what makes *this* token carry `aal2` --
 * without which somebody who just enrolled would still be refused by every
 * policy that calls `has_role('resolver')`, on the account they had only that
 * second set up.
 */
export async function confirmSecondFactor(
  factorId: string,
  code: string,
): Promise<Account> {
  const { error } = await client().auth.mfa.challengeAndVerify({
    factorId,
    code: code.trim(),
  });
  if (error) throw new SupabaseError("Codul nu este valid", error);
  return remember();
}

/**
 * Raise an existing session to `aal2`.
 *
 * For somebody who enrolled a factor yesterday and signed in with a password
 * today: they hold the role, the token says `aal1`, and every privileged
 * policy refuses them until they pass a challenge on the factor they already
 * have.
 */
export async function passSecondFactor(code: string): Promise<Account> {
  const supabaseClient = client();
  const { data, error } = await supabaseClient.auth.mfa.listFactors();
  if (error) throw new SupabaseError("Nu am putut citi factorii", error);

  const factor = (data?.totp ?? []).find((each) => each.status === "verified");
  if (!factor) {
    throw new Error("Nu ai încă o aplicație de autentificare configurată.");
  }
  return confirmSecondFactor(factor.id, code);
}

