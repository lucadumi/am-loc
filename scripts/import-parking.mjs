/**
 * Puts the imported car parks into a configured Supabase project.
 *
 *     node scripts/import-parking.mjs          # both layers
 *     node scripts/import-parking.mjs --dry-run
 *
 * WHY THIS IS A SCRIPT AND NOT A MIGRATION. A migration is a change to the
 * shape of the database, and it is history: once applied it is not edited
 * again. This is neither. It is a refresh of somebody else's data, which is
 * expected to be re-run whenever OpenStreetMap or CMPB change -- and every run
 * would otherwise have meant a new migration file carrying another eight
 * hundred rows of generated SQL, with the real schema buried among them.
 *
 * WHY THE ROWS ARE NEEDED AT ALL, given that both layers are already bundled
 * into the app. Because of one foreign key: `status_reports.spot_id` references
 * `spots.id`, so a driver standing in an imported car park who says "there is
 * space here" writes a claim against a row that has to exist. Without this, the
 * entire imported layer is read-only in exactly the build where reporting is
 * the point.
 *
 * Reads `.env` for `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
 * The anon key is enough: the `spots` insert policy allows any signed-in user
 * to add a public spot, so the script signs in anonymously exactly as the app
 * does. A `service_role` key is deliberately not used -- it bypasses row level
 * security, and a bulk import is the last place that should be routine.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CMPB_PARKING } from "../constants/cmpb-parking.ts";
import { PUBLIC_PARKING } from "../constants/public-parking.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Postgres refuses very large statements; car parks go up in batches. */
const BATCH = 200;

/** `.env` as a map, without adding a dotenv dependency for one script. */
async function readEnv() {
  const env = { ...process.env };
  try {
    const raw = await readFile(path.join(root, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, value] = match;
      if (!env[key]) env[key] = value.replace(/^["']|["']$/g, "");
    }
  } catch {
    // No .env is fine if the variables are already exported.
  }
  return env;
}

/** The columns `spots` actually has, from what the app carries in memory. */
function toRow(spot) {
  return {
    id: spot.id,
    title: spot.title,
    kind: spot.kind ?? "street",
    access: spot.access,
    source: spot.source,
    area: spot.area ?? null,
    latitude: spot.latitude,
    longitude: spot.longitude,
    price_per_hour: spot.pricePerHour ?? null,
    paid: spot.paid ?? null,
    total_count: spot.totalCount ?? null,
    rating: spot.rating ?? null,
    image_url: spot.imageUrl ?? null,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const env = await readEnv();
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  const spots = [...CMPB_PARKING, ...PUBLIC_PARKING];

  /* Both layers are public records, and a row that claimed otherwise would be
     a spot no stranger may report on -- silently removing it from the map's
     only source of truth. Cheap to check, and the failure is invisible. */
  const wrong = spots.filter((spot) => spot.access !== "public");
  if (wrong.length) {
    throw new Error(
      `${wrong.length} imported car park(s) are not public: ${wrong
        .slice(0, 3)
        .map((s) => s.id)
        .join(", ")}`,
    );
  }

  const byId = new Map(spots.map((spot) => [spot.id, spot]));
  if (byId.size !== spots.length) {
    throw new Error(`Duplicate ids across layers: ${spots.length - byId.size}`);
  }

  const rows = [...byId.values()].map(toRow);
  const cmpb = rows.filter((row) => row.source === "cmpb").length;
  const osm = rows.filter((row) => row.source === "osm").length;
  process.stdout.write(`${rows.length} car parks (${cmpb} CMPB, ${osm} OSM)\n`);

  if (dryRun) {
    process.stdout.write("--dry-run: nothing written\n");
    process.stdout.write(`${JSON.stringify(rows[0], null, 2)}\n`);
    return;
  }

  if (!url || !anonKey) {
    throw new Error(
      "No Supabase project configured. Set EXPO_PUBLIC_SUPABASE_URL and " +
        "EXPO_PUBLIC_SUPABASE_ANON_KEY in .env; see .env.example.",
    );
  }

  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: authError } = await client.auth.signInAnonymously();
  if (authError) {
    throw new Error(
      `Could not sign in anonymously (enable Authentication -> Sign In / ` +
        `Providers -> Anonymous sign-ins): ${authError.message}`,
    );
  }

  for (let index = 0; index < rows.length; index += BATCH) {
    const batch = rows.slice(index, index + BATCH);
    /* Upsert rather than insert, so a re-import corrects a car park that was
       renamed or resized without touching the claims filed about it -- the ids
       are stable (`osm_<element>`, `cmpb_<code>`) precisely so this works. */
    const { error } = await client.from("spots").upsert(batch, {
      onConflict: "id",
      ignoreDuplicates: false,
    });
    if (error) {
      throw new Error(
        `Batch ${index / BATCH + 1} failed: ${error.message}` +
          (error.hint ? ` (${error.hint})` : ""),
      );
    }
    process.stdout.write(
      `  imported ${Math.min(index + BATCH, rows.length)}/${rows.length}\n`,
    );
  }

  process.stdout.write(`Done. ${rows.length} car parks in \`spots\`.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message ?? error}\n`);
  process.exit(1);
});
