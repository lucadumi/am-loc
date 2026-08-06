/**
 * Whether there is a backend to talk to at all.
 *
 * This is one boolean in its own file on purpose. Every seam in the data layer
 * has to ask the question, and asking it must not drag in `@supabase/supabase-js`,
 * the URL polyfill and AsyncStorage: those are React Native dependencies, and
 * the unit tests run in bare Node with no device and no bundler. Keeping the
 * gate separate from the client is what lets the seams stay testable and what
 * keeps the client out of the bundle's startup path for anyone who has not
 * configured a project.
 *
 * The variables must be read as whole `process.env.EXPO_PUBLIC_…` expressions.
 * Expo substitutes them textually at build time, so destructuring `process.env`
 * or building the name dynamically yields `undefined` in a release build, which
 * would silently drop the app back to seed data on real devices only.
 *
 * See `.env.example` for what to set and where the values come from.
 */

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** The credentials, or null when the app is running on bundled seed data. */
export function supabaseCredentials(): { url: string; anonKey: string } | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
}

/**
 * True when a Supabase project is configured.
 *
 * When false the app is not broken, it is running on the seed data in
 * `lib/api.ts` and on-device storage, which is what a fresh clone does: `.env`
 * is gitignored, so nobody checking the repo out has credentials, and an app
 * that refused to start without them would be untryable.
 */
export function isRemote(): boolean {
  return supabaseCredentials() !== null;
}
