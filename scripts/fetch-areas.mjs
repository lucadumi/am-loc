/**
 * Fills in the `area` of every imported car park, from OpenStreetMap.
 *
 *     node scripts/fetch-areas.mjs
 *
 * Rewrites `constants/cmpb-parking.ts` and `constants/public-parking.ts` in
 * place, setting `area` to something like `Sector 1 · Dorobanți`.
 *
 * WHY THIS EXISTS. Neither registry says where its car parks are, only what
 * they are called and where they are to six decimals. So `area` was absent on
 * all 838 of them, and the screens that draw a map pin beside it drew a pin
 * beside nothing -- a marker pointing at an empty string, on every card in the
 * app. The choice was to delete the pin or to give it something to point at,
 * and a driver deciding between two car parks called `Parcare Academiei` and
 * `Parcare Batistei` is helped a great deal by being told which is in Sector 1
 * and which is in Centrul Vechi.
 *
 * WHY BOUNDARIES RATHER THAN A GEOCODER. Reverse geocoding 838 points means
 * 838 requests to a service that asks for one a second, which is a quarter of
 * an hour of somebody else's server and against Nominatim's usage policy for
 * bulk work. Two queries fetch the sector polygons and the neighbourhood
 * points once, and everything after that is arithmetic on this machine.
 *
 * WHAT IT WILL NOT DO. Invent an area for a car park it cannot place. A point
 * outside all six sector polygons is left without one, and the screens go back
 * to drawing no pin for it, which is what an unknown is supposed to look like.
 *
 * Data (c) OpenStreetMap contributors, ODbL.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Mirrors, tried in order. The main instance refuses when busy. */
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];

/**
 * The six sectors, with their outlines.
 *
 * `admin_level=9` is what Bucharest's sectors are in OSM; the city itself is 4,
 * which is why the city is resolved first and the sectors asked for inside it.
 * That is also far cheaper for Overpass than sweeping a bounding box for every
 * administrative relation in it, which is the form that kept timing out.
 *
 * `out geom` returns each way's coordinates inline, which is what makes the
 * point-in-polygon below possible without a second round trip per relation.
 */
const SECTORS_QUERY = `
[out:json][timeout:180];
area["name"="București"]["admin_level"="4"]->.city;
relation(area.city)["boundary"="administrative"]["admin_level"="9"];
out geom;
`;

/**
 * The named neighbourhoods, as points.
 *
 * Points rather than polygons on purpose: most Bucharest neighbourhoods are
 * mapped only as a labelled node, and the handful with outlines would make the
 * rule inconsistent -- some car parks placed by containment and others by
 * proximity, with no way for a reader to tell which. Nearest-label is one rule.
 */
const PLACES_QUERY = `
[out:json][timeout:180];
area["name"="București"]["admin_level"="4"]->.city;
node(area.city)["place"~"^(suburb|quarter|neighbourhood)$"]["name"];
out;
`;

/** How far a neighbourhood label may be and still name a car park. */
const NEIGHBOURHOOD_REACH_M = 1200;

/** Overpass refuses while busy, and says so with a 504 rather than a wait. */
const RETRIES = 3;
const RETRY_PAUSE_MS = 20_000;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function overpass(query, what) {
  let lastError;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    for (const endpoint of ENDPOINTS) {
      try {
        process.stdout.write(`  ${what} … `);
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "amloc-fetch-areas (https://github.com/lucadumi/am-loc)",
          },
          body: new URLSearchParams({ data: query }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        if (!text.trimStart().startsWith("{")) throw new Error("busy or refused");
        const data = JSON.parse(text);
        const elements = data.elements ?? [];
        // An empty answer means the query or the mirror is wrong, not that
        // Bucharest has no sectors. Some mirrors carry a partial planet.
        if (!elements.length) throw new Error("answered with nothing");
        process.stdout.write(`${elements.length}\n`);
        return elements;
      } catch (error) {
        process.stdout.write(`${error.message}\n`);
        lastError = error;
      }
    }
    if (attempt < RETRIES) {
      process.stdout.write(`  … all mirrors busy, waiting 20s\n`);
      await pause(RETRY_PAUSE_MS);
    }
  }
  throw lastError;
}

/** Metres between two coordinates. Same haversine as lib/geo.ts. */
function distanceMeters(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * A sector's outline, as closed rings.
 *
 * An OSM boundary relation is a bag of way fragments in no particular order and
 * pointing in no particular direction, so the ways are stitched end to end into
 * rings before anything can be asked to contain a point. A fragment that will
 * not join either end of the ring being built starts a new one, which is how
 * the genuinely disjoint pieces survive.
 */
function ringsOf(relation) {
  const fragments = (relation.members ?? [])
    .filter((m) => m.type === "way" && m.role !== "inner" && m.geometry?.length)
    .map((m) => m.geometry.map((p) => [p.lat, p.lon]));

  const rings = [];
  let current = fragments.shift();

  while (current) {
    const head = current[0];
    const tail = current[current.length - 1];
    const closed =
      Math.abs(head[0] - tail[0]) < 1e-9 && Math.abs(head[1] - tail[1]) < 1e-9;

    if (closed || !fragments.length) {
      rings.push(current);
      current = fragments.shift();
      continue;
    }

    const near = (a, b) =>
      Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;

    const index = fragments.findIndex(
      (f) => near(f[0], tail) || near(f[f.length - 1], tail),
    );
    if (index < 0) {
      rings.push(current);
      current = fragments.shift();
      continue;
    }

    const [next] = fragments.splice(index, 1);
    current = current.concat(near(next[0], tail) ? next.slice(1) : next.reverse().slice(1));
  }

  return rings.filter((ring) => ring.length > 3);
}

/** Ray casting: whether a point falls inside a ring of [lat, lng] pairs. */
function inRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [iLat, iLng] = ring[i];
    const [jLat, jLng] = ring[j];
    if (
      iLng > lng !== jLng > lng &&
      lat < ((jLat - iLat) * (lng - iLng)) / (jLng - iLng) + iLat
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Whichever sector contains the point, or undefined for none of them. */
function sectorOf(lat, lng, sectors) {
  for (const sector of sectors) {
    if (sector.rings.some((ring) => inRing(lat, lng, ring))) return sector.name;
  }
  return undefined;
}

/** The nearest neighbourhood label, if one is close enough to mean anything. */
function neighbourhoodOf(lat, lng, places) {
  let best;
  for (const place of places) {
    const d = distanceMeters(lat, lng, place.lat, place.lon);
    if (d <= NEIGHBOURHOOD_REACH_M && (!best || d < best.d)) {
      best = { d, name: place.tags.name };
    }
  }
  return best?.name;
}

/**
 * Put an `area` on every spot literal in a generated constant.
 *
 * The file is rewritten by regex rather than re-generated, because the two
 * constants are produced by two different scripts against two different
 * sources, and re-running those would refetch everything and drift the data
 * this run has already been checked against. Each spot literal is matched by
 * its own coordinates, so a line only changes when the point it carries is one
 * this script placed.
 */
async function annotate(file, spots) {
  const target = path.join(root, file);
  let source = await readFile(target, "utf8");
  let filled = 0;

  for (const spot of spots) {
    if (!spot.area) continue;

    // The literal for exactly this spot: its id line through its longitude.
    const pattern = new RegExp(
      `(id: "${spot.id}",[\\s\\S]*?longitude: ${spot.longitude},)(\\n\\s*area: "[^"]*",)?`,
    );
    if (!pattern.test(source)) continue;

    const indent = "    ";
    source = source.replace(
      pattern,
      `$1\n${indent}area: ${JSON.stringify(spot.area)},`,
    );
    filled += 1;
  }

  await writeFile(target, source, "utf8");
  return filled;
}

/** Every spot literal in a generated constant: its id and where it is. */
function readSpots(source) {
  const spots = [];
  const pattern =
    /id: "([^"]+)",[\s\S]*?latitude: (-?[\d.]+),\s*\n\s*longitude: (-?[\d.]+),/g;
  let match;
  while ((match = pattern.exec(source))) {
    spots.push({
      id: match[1],
      latitude: Number(match[2]),
      longitude: Number(match[3]),
    });
  }
  return spots;
}

async function main() {
  process.stdout.write("Fetching Bucharest's boundaries from OpenStreetMap…\n");
  const [sectorRelations, placeNodes] = [
    await overpass(SECTORS_QUERY, "sectors"),
    await overpass(PLACES_QUERY, "neighbourhoods"),
  ];

  const sectors = sectorRelations
    .map((relation) => ({
      name: relation.tags?.name,
      rings: ringsOf(relation),
    }))
    .filter((sector) => sector.name && sector.rings.length);

  if (sectors.length !== 6) {
    throw new Error(
      `Expected Bucharest's six sectors, stitched ${sectors.length}. Refusing ` +
        `to write: a missing outline would leave real car parks unplaced.`,
    );
  }

  const places = placeNodes.filter((node) => node.tags?.name);

  let total = 0;
  let placed = 0;

  for (const file of [
    "constants/cmpb-parking.ts",
    "constants/public-parking.ts",
  ]) {
    const source = await readFile(path.join(root, file), "utf8");
    const spots = readSpots(source);

    for (const spot of spots) {
      const sector = sectorOf(spot.latitude, spot.longitude, sectors);
      if (!sector) continue;
      const neighbourhood = neighbourhoodOf(
        spot.latitude,
        spot.longitude,
        places,
      );
      spot.area = neighbourhood ? `${sector} · ${neighbourhood}` : sector;
    }

    const filled = await annotate(file, spots);
    total += spots.length;
    placed += filled;
    process.stdout.write(`  ${file}: ${filled}/${spots.length} placed\n`);
  }

  process.stdout.write(
    `Done. ${placed} of ${total} car parks now carry an area.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exit(1);
});
