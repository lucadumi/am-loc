/**
 * The module loader every suite here runs behind.
 *
 * The tests run in bare Node: no bundler, no device. Two things follow from
 * that and both have to be solved before the first `import` of app code, which
 * is why this is a `register()` hook rather than anything the tests could do
 * afterwards.
 *
 * `@react-native-async-storage/async-storage` is native and cannot load at
 * all, so it is swapped for the in-memory stand-in. And `@/…` is a bundler
 * alias Node knows nothing about, so it is resolved against the project root
 * the way `tsconfig.json` maps it.
 *
 * Pass `supabase: true` to also stand in for `lib/supabase.ts`, which is what
 * lets a suite exercise the channel path without a project. Everything else
 * wants the real module and the default leaves it alone.
 */

import { register } from "node:module";

export function registerTestLoader({ supabase = false } = {}): void {
  const storage = new URL("./fake-async-storage.ts", import.meta.url).href;
  const channels = new URL("./fake-supabase-channels.ts", import.meta.url).href;
  const root = new URL("../package.json", import.meta.url).href;

  register(
    `data:text/javascript,
     export async function resolve(spec, ctx, next) {
       if (spec === "@react-native-async-storage/async-storage") {
         return { url: ${JSON.stringify(storage)}, shortCircuit: true };
       }
       ${
         supabase
           ? `if (spec === "./supabase.ts" || spec === "@/lib/supabase.ts") {
         return { url: ${JSON.stringify(channels)}, shortCircuit: true };
       }`
           : ""
       }
       if (spec.startsWith("@/")) {
         return next("./" + spec.slice(2), { ...ctx, parentURL: ${JSON.stringify(root)} });
       }
       return next(spec, ctx);
     }`,
  );
}
