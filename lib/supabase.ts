/**
 * The Supabase client, and who the app is when it writes.
 *
 * Two things live here and nothing else: constructing the client, and getting
 * a user id to write as. Queries live in `lib/supabase-data.ts` and the
 * row mapping in `lib/supabase-rows.ts`, so that neither has to be loaded to
 * ask whether a backend exists (see `lib/remote.ts` for why that matters).
 *
 * The URL polyfill is imported first and is load-bearing: `@supabase/supabase-js`
 * builds request URLs with the global `URL`, which Hermes does not implement
 * completely, and the failure without it is an obscure one at the first query
 * rather than at import.
 */

import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { supabaseCredentials } from "./remote.ts";

let cached: SupabaseClient | null | undefined;

/**
 * The client, or null when no project is configured.
 *
 * Built lazily and once. Lazily so that importing this module during a cold
 * start does not open a connection the user may never need, and once because
 * two clients would keep two copies of the auth session and race each other
 * refreshing the same token.
 */
export function supabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const credentials = supabaseCredentials();
  cached = credentials
    ? createClient(credentials.url, credentials.anonKey, {
        auth: {
          // The session has to outlive the process, and React Native has no
          // localStorage for the client to reach for by default.
          storage: AsyncStorage,
          persistSession: true,
          autoRefreshToken: true,
          // A redirect URL carrying a session is a browser idea. Leaving this
          // on makes the client parse `window.location` on a platform that
          // has no such thing.
          detectSessionInUrl: false,
        },
      })
    : null;
  return cached;
}

/** Thrown when a query fails, so a caller sees the table and the cause. */
export class SupabaseError extends Error {
  constructor(what: string, cause: unknown) {
    const detail =
      cause && typeof cause === "object" && "message" in cause
        ? String((cause as { message: unknown }).message)
        : String(cause);
    super(`${what}: ${detail}`);
    this.name = "SupabaseError";
  }
}

/**
 * The signed-in user's id, signing in anonymously if there is nobody yet.
 *
 * Every writable table keys off `auth.uid()`, both in its foreign key to
 * `auth.users` and in its row level security policy, so the app needs a real
 * user before it can file so much as a status report. AmLoc has no login
 * screen and does not want one yet: asking a driver to make an account before
 * they can say a kerb is free is how a community map gets no reports at all.
 *
 * An anonymous user is a genuine row in `auth.users` with a genuine uuid, so
 * reputation accrues to it exactly as it would to a signed-up account, and
 * `supabase.auth.linkIdentity` can attach an email to it later without
 * orphaning that history.
 *
 * Requires **Authentication -> Sign In / Providers -> Anonymous sign-ins** to
 * be enabled on the project; the error below says so, because the failure is
 * otherwise a bare "signups not allowed" with no hint as to which switch.
 */
export async function currentReporterId(): Promise<string> {
  const client = supabase();
  if (!client) {
    throw new Error(
      "No Supabase project is configured; see .env.example. Callers must check isRemote() first.",
    );
  }

  const { data: existing } = await client.auth.getSession();
  if (existing.session?.user.id) return existing.session.user.id;

  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) {
    throw new SupabaseError(
      "Could not create an anonymous session (enable Authentication -> Sign In / Providers -> Anonymous sign-ins)",
      error,
    );
  }
  return data.user.id;
}
