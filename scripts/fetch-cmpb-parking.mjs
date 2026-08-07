/**
 * Builds `constants/cmpb-parking.ts` from Compania Municipală Parking București.
 *
 *     node scripts/fetch-cmpb-parking.mjs
 *     node scripts/fetch-areas.mjs        # ← and then this, always
 *
 * THE SECOND LINE IS NOT OPTIONAL. This script writes the file from scratch,
 * and the `area` of every lot is put there afterwards by `fetch-areas.mjs`.
 * Running only the first line strips the area from all 768 of them, and does
 * it quietly: a missing area is drawn as nothing rather than as an error.
 *
 * The paid half of Bucharest's public parking: the blue zone. CMPB is the
 * municipal company that runs it, and this is their own layer -- the one their
 * app draws -- rather than anybody's guess about it.
 *
 * WHY THIS AS WELL AS OPENSTREETMAP. They answer different questions and both
 * are needed. OSM knows about car parks generally, including the free ones and
 * the private garages, but its coverage of the blue zone is thin and it carries
 * almost no tariffs. CMPB knows every space it operates, exactly how many bays
 * each has, and what it charges -- and knows nothing at all about a car park it
 * does not run. Together they are roughly 850 real places; separately, either
 * is a map with a hole in it.
 *
 * The two layers overlap, and `lib/api.ts` is where that is resolved.
 *
 * WHAT THIS IMPORT DOES NOT CLAIM, which is the same caveat as the OSM one and
 * matters more here because the data looks more official. `Locuri: 104` is how
 * many bays CMPB painted, not how many are empty. CMPB publishes no occupancy
 * anywhere -- the `closed` flag in their own popup is an Alpine.js default of
 * `false`, a UI initialiser rather than a status -- and neither does anybody
 * else for Bucharest. These arrive with no observation attached and read as
 * "Fără raportări" until a driver files one; see the `record` branch in
 * lib/spot-belief.ts, which treats `cmpb` exactly as it treats `osm`.
 *
 * ON THE SOURCE. `parking-lots.geojson` is the file CMPB's own web app fetches,
 * unauthenticated, to draw its map. It is not advertised as an open dataset and
 * CMPB's terms are contradictory about programmatic reuse: reproduction is
 * "autorizată, cu menţionarea sursei" in one sentence and copying "datele cu
 * care operează" is forbidden in the next. This script therefore runs at build
 * time and not on drivers' phones, takes the file once rather than polling it,
 * and the generated constant names CMPB as the source on every screen that
 * draws it. Written permission from `parking@cmpb.ro` is the thing that would
 * settle it properly, and is worth asking for before this ships.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = "https://parkingbucuresti.ro/parking-lots.geojson";

/**
 * Bucharest, generously, as [south, west, north, east].
 *
 * Wider than the OSM import's box because CMPB operates to the city limits and
 * there is no reason to crop their own network to the centre. It is a filter
 * rather than a formality: the file carries a handful of rows at the seaside
 * with implausible capacities (`QPORT`, 10.000 locuri, at Constanța), which are
 * evidently test rows and would otherwise land on the map as the largest car
 * parks in the country.
 */
const BOUNDS = { south: 44.3, west: 25.9, north: 44.6, east: 26.3 };

/** Rows this big are test data, not car parks. The largest real one is ~1.000. */
const IMPLAUSIBLE_CAPACITY = 3000;

const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../constants/cmpb-parking.ts",
);

/**
 * The readable text of a popup.
 *
 * CMPB puts the whole of each lot's description in one HTML blob meant for
 * Alpine.js, so the fields have to be read back out of it. Tags are dropped,
 * entities decoded, whitespace collapsed; what is left is
 * `NAME Cod: P0101 Locuri: 104 5 lei/oră ( 30 lei/zi ) Book Now`.
 */
function plainText(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Title case, because CMPB writes every name in capitals. */
function titleCase(name) {
  return name
    .toLocaleLowerCase("ro-RO")
    .replace(/(^|[\s(\-–/.])([\p{L}])/gu, (_, before, letter) =>
      before + letter.toLocaleUpperCase("ro-RO"),
    )
    /* Roman numerals and compass letters are not words: `SECTOR 1S` must not
       come back as `Sector 1s`, and `PIATA ALBA IULIA II` not as `Ii`. */
    .replace(/\b([IVX]+)\b/gi, (m) => m.toUpperCase())
    .replace(/(\d)([a-z])\b/g, (_, digit, letter) => digit + letter.toUpperCase());
}

/** One feature, as the fields the app's `ParkingSpot` wants. */
function readFeature(feature) {
  const [longitude, latitude] = feature.geometry?.coordinates ?? [];
  if (typeof longitude !== "number" || typeof latitude !== "number") return null;

  const properties = feature.properties ?? {};
  const text = plainText(String(properties.description ?? ""));
  const code = String(properties.code ?? "").trim();
  if (!code) return null;

  /* The name is whatever precedes `Cod:`. Falling back to the code keeps a lot
     with an empty heading on the map with an honest label rather than a blank. */
  const name = text.split(/\s*Cod:/)[0]?.trim();
  const capacity = Number(text.match(/Locuri:\s*(\d+)/)?.[1] ?? NaN);
  const hourly = Number(
    text.match(/([\d]+(?:[.,]\d+)?)\s*lei\s*\/\s*or/i)?.[1]?.replace(",", ".") ?? NaN,
  );

  return {
    code,
    title: name ? titleCase(name) : code,
    latitude,
    longitude,
    totalCount: Number.isFinite(capacity) && capacity > 0 ? capacity : undefined,
    pricePerHour: Number.isFinite(hourly) ? hourly : undefined,
  };
}

const inBucharest = (lot) =>
  lot.latitude >= BOUNDS.south &&
  lot.latitude <= BOUNDS.north &&
  lot.longitude >= BOUNDS.west &&
  lot.longitude <= BOUNDS.east;

const plausible = (lot) =>
  lot.totalCount === undefined || lot.totalCount < IMPLAUSIBLE_CAPACITY;

/** A TypeScript literal for a value that may be absent. */
const field = (key, value) =>
  value === undefined ? "" : `\n    ${key}: ${JSON.stringify(value)},`;

async function main() {
  process.stdout.write(`Fetching ${SOURCE}\n`);
  const response = await fetch(SOURCE, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`CMPB answered ${response.status} ${response.statusText}`);
  }

  const collection = await response.json();
  const features = collection?.features;
  if (!Array.isArray(features) || !features.length) {
    throw new Error("CMPB returned no features; refusing to write an empty file");
  }

  const seen = new Set();
  const lots = [];
  for (const feature of features) {
    const lot = readFeature(feature);
    if (!lot || !inBucharest(lot) || !plausible(lot)) continue;
    if (seen.has(lot.code)) continue;
    seen.add(lot.code);
    lots.push(lot);
  }
  lots.sort((a, b) => a.code.localeCompare(b.code));

  if (!lots.length) throw new Error("Nothing survived filtering; not writing");

  const spaces = lots.reduce((sum, lot) => sum + (lot.totalCount ?? 0), 0);
  const priced = lots.filter((lot) => lot.pricePerHour !== undefined).length;

  const body = lots
    .map(
      (lot) => `  {
    id: "cmpb_${lot.code}",
    title: ${JSON.stringify(lot.title)},
    access: "public",
    source: "cmpb",
    kind: "street",
    status: "taken",
    latitude: ${lot.latitude},
    longitude: ${lot.longitude},
    updatedAt: FETCHED_AT,
    paid: true,${field("pricePerHour", lot.pricePerHour)}${field("totalCount", lot.totalCount)}
  },`,
    )
    .join("\n");

  const file = `/**
 * Bucharest's blue zone, as Compania Municipală Parking București publishes it.
 * Generated -- do not edit by hand.
 *
 *     node scripts/fetch-cmpb-parking.mjs
 *
 * ${lots.length} car parks, ${spaces.toLocaleString("en-GB")} bays, ${priced} with a published tariff,
 * fetched ${new Date().toISOString().slice(0, 10)}.
 *
 * WHAT THESE ARE. The paid public parking the city itself operates, at the size
 * and price CMPB records. Municipal data about municipal spaces, which is as
 * close to authoritative as parking in Bucharest gets, and the reason the app
 * can quote a real tariff instead of shrugging: everything here is \`paid: true\`
 * with a rate attached.
 *
 * WHAT THEY DO NOT SAY, and it is the important part. Nothing about whether
 * there is a space in one now. \`totalCount\` is how many bays exist, never how
 * many are empty -- CMPB publishes no occupancy, and the belief model is what
 * answers "is it free" here as everywhere else. Because \`source\` is \`"cmpb"\`,
 * \`reportsFor\` in lib/spot-belief.ts files these under records rather than
 * observations, so a car park nobody has looked at reads "Fără raportări"
 * instead of pretending somebody checked it the moment this file was generated.
 *
 * Source: Compania Municipală Parking București (parkingbucuresti.ro). Their
 * terms authorise reproduction "cu menţionarea sursei", so any screen drawing
 * this layer has to name them; see \`CMPB_ATTRIBUTION\`.
 */

import type { ParkingSpot } from "@/types";

/** When the layer was pulled from CMPB. Not an observation of any car park. */
export const CMPB_FETCHED_AT = ${JSON.stringify(new Date().toISOString())};

/** Required wherever the layer is drawn. */
export const CMPB_ATTRIBUTION = "Sursă: Compania Municipală Parking București";

const FETCHED_AT = CMPB_FETCHED_AT;

/**
 * The blue zone, with \`updatedAt\` left at the fetch time.
 *
 * That timestamp is when the record was read, not when anybody looked at the
 * car park, and nothing may read it as an observation.
 */
export const CMPB_PARKING: ParkingSpot[] = [
${body}
];
`;

  await writeFile(OUT, file, "utf8");
  process.stdout.write(
    `Wrote ${lots.length} CMPB car parks (${spaces.toLocaleString("en-GB")} bays) to ${OUT}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exit(1);
});
