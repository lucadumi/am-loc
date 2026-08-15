/**
 * Builds `constants/sectors.ts`: Bucharest's six sector boundaries.
 *
 *     node scripts/fetch-sectors.mjs
 *
 * WHY THE APP NEEDS THESE AT ALL. A blocker report has to say which sector it
 * is in, so that a sector hall is shown the complaints it is responsible for
 * and not the ones it is not -- see `may_resolve` in
 * `supabase/migrations/0011_institutional_resolvers.sql`.
 *
 * WHY ON THE DEVICE RATHER THAN IN POSTGRES. Testing a point against a polygon
 * is PostGIS's job and this project does not enable it. The alternative that
 * needs no extension is to do the arithmetic where the report is written, which
 * is the phone -- and `scripts/fetch-areas.mjs` already places 838 car parks
 * exactly this way, so the rule and the code are the same ones.
 *
 * WHY NOT REVERSE GEOCODE AT FILING TIME. Because it would put a network call
 * between a driver and a report they are trying to send, in the one moment when
 * a car is on a pavement and they are standing in the road. Nominatim also asks
 * for one request a second, which a busy street would not respect.
 *
 * SIMPLIFIED, AND BY HOW MUCH. The raw relations are ~40.000 points, which is
 * megabytes of bundle for a question whose answer is one of seven. They are
 * reduced with Douglas-Peucker at a tolerance of roughly 25 metres: a report
 * within 25 metres of a sector boundary may be placed on either side, and that
 * is not a defect worth paying for. Bucharest's sector boundaries run down the
 * middle of roads, so a blockage that close to one is genuinely ambiguous --
 * and a city-wide body reaches every sector regardless.
 *
 * Data (c) OpenStreetMap contributors, ODbL.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OVERPASS = "https://overpass-api.de/api/interpreter";

/**
 * The six sectors, as ways with their coordinates inline.
 *
 * `admin_level=9` is the sector in Bucharest's hierarchy, and the city is
 * resolved first so the query does not scan the country. `out geom` returns
 * each way's points, which is what makes assembling the rings possible without
 * a request per way.
 */
const QUERY = `
[out:json][timeout:180];
area["name"="București"]["admin_level"="4"]->.city;
relation(area.city)["boundary"="administrative"]["admin_level"="9"];
out geom;
`;

/** Roughly 25 m, in degrees of latitude. Longitude is close enough at 44°N. */
const TOLERANCE = 25 / 111_320;

/** Perpendicular distance from a point to the line through two others. */
function deviation([lat, lng], [aLat, aLng], [bLat, bLng]) {
  const dLat = bLat - aLat;
  const dLng = bLng - aLng;
  const span = Math.hypot(dLat, dLng);
  if (!span) return Math.hypot(lat - aLat, lng - aLng);
  return Math.abs(dLng * (aLat - lat) - dLat * (aLng - lng)) / span;
}

/**
 * Douglas-Peucker: drop every point that is not doing any work.
 *
 * Recursive on the furthest point from the chord, which is what keeps the
 * *shape* rather than every nth vertex -- a boundary sampled evenly loses its
 * corners, and a corner is where a sector actually turns.
 */
function simplify(ring, tolerance) {
  if (ring.length < 3) return ring;

  let worst = 0;
  let at = 0;
  for (let i = 1; i < ring.length - 1; i++) {
    const d = deviation(ring[i], ring[0], ring[ring.length - 1]);
    if (d > worst) {
      worst = d;
      at = i;
    }
  }

  if (worst <= tolerance) return [ring[0], ring[ring.length - 1]];

  return [
    ...simplify(ring.slice(0, at + 1), tolerance).slice(0, -1),
    ...simplify(ring.slice(at), tolerance),
  ];
}

/**
 * A relation's outer ways, joined into closed rings.
 *
 * Overpass returns the ways in no particular order and in no particular
 * direction, so each one is tried at both ends and reversed when it fits
 * backwards. A boundary that fails to close is dropped rather than guessed at:
 * an open ring makes ray casting answer nonsense rather than fail.
 */
function ringsOf(relation) {
  const ways = relation.members
    .filter((m) => m.type === "way" && m.role !== "inner" && m.geometry)
    .map((m) => m.geometry.map((p) => [p.lat, p.lon]));

  const rings = [];
  while (ways.length) {
    let ring = ways.pop();
    let joined = true;
    while (joined) {
      joined = false;
      for (let i = 0; i < ways.length; i++) {
        const way = ways[i];
        const [head] = ring;
        const tail = ring[ring.length - 1];
        const [wayHead] = way;
        const wayTail = way[way.length - 1];
        const same = (a, b) => a[0] === b[0] && a[1] === b[1];

        if (same(tail, wayHead)) ring = [...ring, ...way.slice(1)];
        else if (same(tail, wayTail)) ring = [...ring, ...way.slice(0, -1).reverse()];
        else if (same(head, wayTail)) ring = [...way.slice(0, -1), ...ring];
        else if (same(head, wayHead)) ring = [...way.slice(1).reverse(), ...ring];
        else continue;

        ways.splice(i, 1);
        joined = true;
        break;
      }
    }
    const [first] = ring;
    const last = ring[ring.length - 1];
    if (first[0] === last[0] && first[1] === last[1] && ring.length > 3) {
      rings.push(ring);
    }
  }
  return rings;
}

/**
 * `Sector 3` to `sector_3`, which is what the Postgres enum holds.
 *
 * Both spellings, because OpenStreetMap carries `Sector 3` today and
 * `Sectorul 3` is the form the sector halls use themselves -- a pattern that
 * read only one would return six sectors on one import and none on the next,
 * and the failure is at the bottom of this file rather than here.
 */
function jurisdictionOf(name) {
  const number = /sector(?:ul)?\s*(\d)/i.exec(name ?? "")?.[1];
  return number ? `sector_${number}` : undefined;
}

const response = await fetch(OVERPASS, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "AmLoc/1.0 (https://github.com/lucadumi/am-loc)",
  },
  body: `data=${encodeURIComponent(QUERY)}`,
});
if (!response.ok) {
  throw new Error(`Overpass answered ${response.status}`);
}

/* Overpass answers a refusal with 200 and an XML document, so the status is
   not enough to know whether this worked. The body says which of the two it is
   -- and the refusal is usually "too many requests" or "timed out", both of
   which are worth reading rather than being reported as a parse error. */
const raw = await response.text();
if (!raw.trimStart().startsWith("{")) {
  throw new Error(`Overpass refused:\n${raw.slice(0, 400)}`);
}

const { elements } = JSON.parse(raw);

const sectors = [];
for (const relation of elements) {
  const jurisdiction = jurisdictionOf(relation.tags?.name);
  if (!jurisdiction) continue;

  const rings = ringsOf(relation)
    .map((ring) => simplify(ring, TOLERANCE))
    .filter((ring) => ring.length > 3);
  if (!rings.length) continue;

  sectors.push({ jurisdiction, name: relation.tags.name, rings });
}

sectors.sort((a, b) => a.jurisdiction.localeCompare(b.jurisdiction));

if (sectors.length !== 6) {
  throw new Error(
    `Expected six sectors, assembled ${sectors.length}: ${sectors
      .map((s) => s.jurisdiction)
      .join(", ")}`,
  );
}

const points = sectors.reduce(
  (sum, s) => sum + s.rings.reduce((n, r) => n + r.length, 0),
  0,
);

const body = sectors
  .map(
    (s) => `  {
    jurisdiction: "${s.jurisdiction}",
    name: ${JSON.stringify(s.name)},
    rings: [
${s.rings
  .map(
    (ring) =>
      `      [${ring.map(([lat, lng]) => `[${lat.toFixed(5)}, ${lng.toFixed(5)}]`).join(", ")}],`,
  )
  .join("\n")}
    ],
  },`,
  )
  .join("\n");

const file = `/**
 * Bucharest's six sectors, as boundaries a point can be tested against.
 *
 * Generated by \`scripts/fetch-sectors.mjs\`. Do not edit by hand.
 *
 * Here so that a blocker report can say which administration is responsible
 * for it without a network call at the moment it is filed -- see
 * \`lib/jurisdiction.ts\` for the test and the migration \`0011\` for what the
 * answer is used for.
 *
 * Simplified to about 25 metres, so a point within that of a boundary may fall
 * either side. Sector boundaries run down the middle of roads, so a blockage
 * that close to one is genuinely ambiguous -- and a city-wide body reaches
 * every sector regardless.
 *
 * ${points} points across ${sectors.length} sectors, fetched ${new Date().toISOString().slice(0, 10)}.
 *
 * Data (c) OpenStreetMap contributors, ODbL.
 */

import type { Jurisdiction } from "../lib/jurisdiction.ts";

export interface SectorBoundary {
  jurisdiction: Jurisdiction;
  /** As OpenStreetMap names it, e.g. "Sectorul 1". */
  name: string;
  /** Closed rings of [latitude, longitude]. */
  rings: [number, number][][];
}

export const SECTORS: SectorBoundary[] = [
${body}
];
`;

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "constants", "sectors.ts");
await writeFile(out, file);

console.log(`Wrote ${sectors.length} sectors, ${points} points, to ${out}`);
