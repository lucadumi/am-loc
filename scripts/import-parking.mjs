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
 * WHY THIS ONE NEEDS THE SERVICE ROLE KEY, when nothing else in the codebase
 * does. Because an imported car park has no author, and the schema says so:
 * `created_by` is null for these, since no driver added them -- the same
 * reasoning that leaves `reportedBy` undefined for a spot nobody has reported
 * on. But the insert policy for drivers requires `created_by = auth.uid()`,
 * exactly so that a driver cannot file a spot under somebody else's name.
 *
 * The two cannot both hold through the same key, and the alternative is worse.
 * Widening the policy to accept rows with no author, so long as they claim a
 * registry `source`, would let anyone holding the anon key -- which ships
 * inside the app -- insert invented car parks marked as the municipality's.
 * The municipal layer would become the easiest thing in the app to forge.
 *
 * So this is an operator's tool and says so. It is run by hand, from a machine
 * that has the key, and never by the app. The key is read from
 * `SUPABASE_SERVICE_ROLE_KEY` -- deliberately without the `EXPO_PUBLIC_`
 * prefix, because that prefix is what makes Expo inline a variable into the
 * bundle, and a service role key in a mobile bundle would hand every user the
 * ability to bypass row level security entirely.
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

/**
 * The columns `spots` actually has, from what the app carries in memory.
 *
 * `created_by` is absent rather than set to whoever ran this, and that is the
 * point: nobody added these places, a registry recorded them. Attributing 865
 * car parks to an operator's account would invent authorship, in the same way
 * that crediting an imported record as an observation would invent a witness.
 */
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
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  const spots = [...CMPB_PARKING, ...PUBLIC_PARKING];

  /* Both layers are registries of public road, and a row that claimed anything
     else would be a car park somebody could be offered money for -- see the
     header of lib/spot-rights.ts for why that is an offence rather than a
     feature. Cheap to check, and the failure would otherwise be invisible. */
  const wrong = spots.filter((spot) => spot.access !== "public_facility");
  if (wrong.length) {
    throw new Error(
      `${wrong.length} imported car park(s) are not public facilities: ${wrong
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

  if (!url) {
    throw new Error(
      "No Supabase project configured. Set EXPO_PUBLIC_SUPABASE_URL in .env; " +
        "see .env.example.",
    );
  }
  if (!serviceKey) {
    throw new Error(
      "This import needs SUPABASE_SERVICE_ROLE_KEY (Settings -> API -> " +
        "`service_role`). Imported car parks have no author, which the driver " +
        "insert policy rightly forbids; see the header of this file. Never " +
        "give it an EXPO_PUBLIC_ prefix -- that would ship it in the app.",
    );
  }

  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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

  /* Car parks the registries no longer list.
   *
   * Without this, an import is add-only and every run leaves ghosts: the
   * residents' bays and the OSM duplicates dropped from the bundled layers
   * stayed in `spots` and went on being served to the app, which reads the
   * table rather than the constants. They are the rows that look worst, too --
   * a duplicate marked "Gratuit" over a lot CMPB charges for.
   *
   * Scoped to `source in ('osm','cmpb')`, so a kerb a driver dropped a pin on
   * and a garage somebody listed are never touched by an import: those belong
   * to their authors, not to a registry.
   */
  const registryIds = new Set(rows.map((row) => row.id));
  const { data: existing, error: readError } = await client
    .from("spots")
    .select("id")
    .in("source", ["osm", "cmpb"]);
  if (readError) throw new Error(`Could not list spots: ${readError.message}`);

  const stale = (existing ?? [])
    .map((row) => row.id)
    .filter((id) => !registryIds.has(id));

  if (stale.length) {
    /* A deletion cascades to the claims filed about the spot, so a broken
       import must not be allowed to take the map with it. Losing a tenth of
       the registry in one run means the fetch failed, not that Bucharest
       demolished eighty car parks overnight. */
    const share = stale.length / Math.max(existing.length, 1);
    if (share > 0.1) {
      throw new Error(
        `Refusing to delete ${stale.length} of ${existing.length} imported ` +
          `car parks (${Math.round(share * 100)}%). Re-run the fetch scripts ` +
          `and check their output before importing again.`,
      );
    }

    for (let index = 0; index < stale.length; index += BATCH) {
      const batch = stale.slice(index, index + BATCH);
      const { error } = await client.from("spots").delete().in("id", batch);
      if (error) throw new Error(`Could not remove stale spots: ${error.message}`);
    }
    process.stdout.write(`  removed ${stale.length} no longer listed\n`);
  }

  process.stdout.write(`Done. ${rows.length} car parks in \`spots\`.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message ?? error}\n`);
  process.exit(1);
});
