/**
 * Builds `constants/public-parking.ts` from OpenStreetMap.
 *
 *     node scripts/fetch-parking.mjs
 *
 * The public half of the map. Where a private spot is listed by the person who
 * owns it, a public one is a place the city already knows about, and the app's
 * job is to have read the record rather than to wait for somebody to tell it.
 *
 * WHY OPENSTREETMAP, AND NOT THE CITY. Because there is nothing else. As of
 * 2026 the blue zone is run by Compania Municipală Parking București, which
 * publishes no API and no downloadable geometry; the PMB planning portal draws
 * its parking layer through a web UI with no documented REST endpoint;
 * data.gov.ro has no Bucharest parking dataset; and residents' parking is
 * administered separately by each of the six sector halls, only one of which
 * (Sector 1) runs an open data portal at all, and that one carries no parking
 * dataset either. Nothing here is scraped from any of them: consuming a
 * municipal map through the back door would be both fragile and a licensing
 * problem, where OSM is explicitly licensed for this.
 *
 * WHAT THIS IMPORT DOES NOT CLAIM. Only that these car parks exist and roughly
 * how large they are. Nothing about whether there is space in one right now: OSM
 * has no such data, nobody does, and inventing it is the failure this whole
 * codebase is arranged against. They arrive with no observation attached and
 * read as "Fără raportări" until a driver says otherwise -- see the `record`
 * branch in lib/spot-belief.ts.
 *
 * Data (c) OpenStreetMap contributors, ODbL. The generated file carries the
 * attribution, which the licence requires.
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** Central Bucharest, as [south, west, north, east]. */
const BBOX = [44.38, 26.02, 44.5, 26.18];

/** Mirrors, tried in order. The main instance rejects requests when busy. */
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];

/**
 * Named or measured car parks the public may use.
 *
 * Three filters, each earning its place.
 *
 * `access!~private|no` drops the ones a driver cannot use. A residents-only
 * courtyard is a real car park and a useless search result.
 *
 * Requiring a name or a capacity drops the long tail of unnamed five-space
 * scraps behind blocks of flats. There are about three thousand parking
 * elements in central Bucharest and most are these; carrying them all would
 * treble the bundle to add pins a driver cannot act on, since without a name or
 * a size there is nothing to say about them beyond "something is here".
 *
 * `out center` returns one coordinate per element instead of its full polygon,
 * which is all a pin needs and a fraction of the bytes.
 */
const QUERY = (bbox) => `
[out:json][timeout:120];
(
  way["amenity"="parking"]["access"!~"private|no"]["name"](${bbox});
  node["amenity"="parking"]["access"!~"private|no"]["name"](${bbox});
  way["amenity"="parking"]["access"!~"private|no"]["capacity"](${bbox});
  node["amenity"="parking"]["access"!~"private|no"]["capacity"](${bbox});
  way["amenity"="parking"]["parking"~"multi-storey|underground"]["access"!~"private|no"](${bbox});
);
out center tags;
`;

async function overpass(query) {
  let lastError;
  for (const endpoint of ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "amloc-fetch-parking (https://github.com/lucadumi/am-loc)",
        },
        body: new URLSearchParams({ data: query }),
      });
      if (!response.ok) throw new Error(`${endpoint}: HTTP ${response.status}`);
      const text = await response.text();
      if (!text.trimStart().startsWith("{")) {
        throw new Error(`${endpoint}: busy or refused`);
      }
      const data = JSON.parse(text);
      // An empty answer means the query or the endpoint is wrong, not that
      // Bucharest has no car parks. Writing it out would silently empty the map.
      if ((data.elements ?? []).length === 0) {
        throw new Error(`${endpoint}: answered with nothing`);
      }
      return data;
    } catch (error) {
      console.warn(`  … ${error.message}`);
      lastError = error;
    }
  }
  throw lastError;
}

const round = (n) => Number(n.toFixed(6));

/** A capacity worth trusting: a positive integer, not "approx 30" or "yes". */
function capacityOf(tags) {
  const raw = Number.parseInt(tags.capacity ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : undefined;
}

/**
 * Structure or kerb.
 *
 * `SpotKind` only has the two, and a surface car park is much more like a
 * garage than like a few metres of kerb: it is a facility with a gate, a size
 * and an operator. So anything built or sizeable counts as one, and only the
 * small unstructured remainder stays `street`.
 */
function kindOf(tags) {
  const built = ["multi-storey", "underground", "garage_boxes", "rooftop"];
  if (built.includes(tags.parking)) return "garage";
  return (capacityOf(tags) ?? 0) >= 20 ? "garage" : "street";
}

/** What to call it, preferring what is written on the sign. */
function titleOf(tags) {
  if (tags.name) return tags.name;
  const street = tags["addr:street"];
  if (street) return `Parcare, ${street}`;
  if (tags.parking === "underground") return "Parcare subterană";
  if (tags.parking === "multi-storey") return "Parcare supraetajată";
  return null;
}

function toSpots(elements) {
  const spots = [];

  for (const element of elements) {
    const tags = element.tags ?? {};
    const title = titleOf(tags);
    // Something with neither a name nor an address is a shape on a map; there
    // is nothing to show a driver but a dot.
    if (!title) continue;

    const point = element.type === "node" ? element : element.center;
    if (!point) continue;

    spots.push({
      id: `osm_${element.type[0]}${element.id}`,
      title,
      access: "public",
      source: "osm",
      kind: kindOf(tags),
      /* No observation exists, so this is not a claim that it is free. It is
         the conservative flattening, and `withBelief` gives these spots a
         confidence of zero and the label "Fără raportări". */
      status: "taken",
      latitude: round(point.lat),
      longitude: round(point.lon),
      totalCount: capacityOf(tags),
      /* Deliberately no price. OSM records *whether* a car park charges, not
         what it charges, and `pricePerHour` left undefined already means free
         everywhere else in the app -- so filling it in from `fee=yes` would say
         "free" about somewhere that is not. `paid` records the question
         truthfully; the amount stays unknown until somebody reads the sign. */
      paid: tags.fee === "yes" ? true : tags.fee === "no" ? false : undefined,
    });
  }

  return spots;
}

const serialise = (spot) =>
  `  {\n` +
  Object.entries(spot)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `    ${key}: ${JSON.stringify(value)},`)
    .join("\n") +
  `\n  },`;

function render(spots, fetchedAt) {
  const garages = spots.filter((s) => s.kind === "garage").length;
  const sized = spots.filter((s) => s.totalCount).length;

  return `/**
 * Public car parks in central Bucharest. Generated -- do not edit by hand.
 *
 *     node scripts/fetch-parking.mjs
 *
 * ${spots.length} car parks (${garages} structures, ${sized} with a recorded
 * capacity), fetched ${fetchedAt.slice(0, 10)}.
 *
 * WHAT THESE ARE. Places the map knows exist, at roughly the size recorded.
 * Nothing here says whether there is space in one now -- OSM has no such field,
 * no Bucharest authority publishes one, and guessing would make the app's
 * central promise worthless. They carry no observation and read as "Fără
 * raportări" until a driver files one, at which point they join the belief model
 * like any other public kerb.
 *
 * WHY NOT THE CITY'S OWN DATA. There is none to have. Compania Municipală
 * Parking București runs the blue zone and publishes no API; the PMB planning
 * portal has no documented REST endpoint; data.gov.ro carries no Bucharest
 * parking dataset; and residents' parking is administered by each sector
 * separately. When any of that changes, this file gains a sibling rather than a
 * rewrite -- \`source\` already distinguishes \`osm\` from \`city\`.
 *
 * Unlike \`SEED_SPOTS\` in lib/api.ts, this is not stand-in data and
 * \`lib/remote.ts\` must not suppress it. The seeds are invented and a configured
 * backend rightly replaces them; these are real places.
 *
 * Data (c) OpenStreetMap contributors, available under the Open Database
 * Licence. Any screen that draws this layer has to say so.
 */

import type { ParkingSpot } from "@/types";

/** The area this file covers, as [south, west, north, east]. */
export const PARKING_AREA = [${BBOX.join(", ")}] as const;

/** When the layer was last pulled from OpenStreetMap. */
export const PARKING_FETCHED_AT = ${JSON.stringify(fetchedAt)};

/** Required wherever the layer is drawn. */
export const PARKING_ATTRIBUTION = "© OpenStreetMap contributors (ODbL)";

/**
 * Car parks with \`updatedAt\` left at the fetch time.
 *
 * That timestamp is when the *record* was read, not when anybody looked at the
 * car park, and nothing may read it as an observation. \`reportsFor\` in
 * lib/spot-belief.ts skips the seed claim for these precisely so it cannot.
 */
export const PUBLIC_PARKING: ParkingSpot[] = [
${spots.map(serialise).join("\n")}
].map((spot) => ({ ...spot, updatedAt: PARKING_FETCHED_AT }) as ParkingSpot);
`;
}

console.log("Fetching public car parks from OpenStreetMap…");

const data = await overpass(QUERY(BBOX.join(",")));
const spots = toSpots(data.elements ?? []);
spots.sort((a, b) => a.id.localeCompare(b.id));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "constants", "public-parking.ts");
await writeFile(out, render(spots, new Date().toISOString()));

console.log(
  `Wrote ${spots.length} car parks to constants/public-parking.ts ` +
    `(from ${data.elements.length} elements)`,
);
