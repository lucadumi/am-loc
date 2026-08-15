/**
 * Which sector a point is in, and therefore whose complaint it is.
 *
 * A blocker report names a place and somebody has to be responsible for it.
 * Bucharest has six sector administrations and each answers for its own
 * ground; a complaint about a pavement in Sector 5 sent to Sector 2 is not a
 * complaint, it is a message nobody will act on.
 *
 * WHY THE ANSWER IS COMPUTED HERE RATHER THAN ASKED FOR. Two reasons, and the
 * second is the one that decided it. Testing a point against a polygon is
 * PostGIS's job and this project does not enable it. And the alternative --
 * reverse geocoding when the report is filed -- would put a network round trip
 * between a driver and the thing they are trying to send, in the one moment
 * when a car is on a pavement and they are standing in the road.
 *
 * So the boundaries are bundled and the arithmetic runs on the phone. It is
 * the same rule `scripts/fetch-areas.mjs` already uses to place 838 car parks,
 * and the same ray casting.
 *
 * Pure, with no runtime imports beyond the boundaries themselves, so
 * `node --test` loads it.
 */

/* Relative, with the extension, like every other pure module here: `@/` is a
   bundler alias and these are loaded by `node --test` with no bundler. */
import { SECTORS } from "../constants/sectors.ts";
import type { OrganisationKind } from "../types/index.ts";

/**
 * Where a body's authority runs, as Postgres holds it.
 *
 * The same strings as the `jurisdiction` enum in
 * `supabase/migrations/0011_institutional_resolvers.sql`, so a value read here
 * goes into the column without translation. `city` is for a body that reaches
 * all six -- the mayoralty, the national police -- and is never the answer to
 * "where is this report", only to "how far does this office reach".
 */
export type Jurisdiction =
  | "sector_1"
  | "sector_2"
  | "sector_3"
  | "sector_4"
  | "sector_5"
  | "sector_6"
  | "city";

/** The six that a place can actually be in. */
export const SECTOR_JURISDICTIONS = [
  "sector_1",
  "sector_2",
  "sector_3",
  "sector_4",
  "sector_5",
  "sector_6",
] as const;

/**
 * Whether a point falls inside a closed ring, by ray casting.
 *
 * Counts how many times a ray from the point crosses the boundary: odd is
 * inside. The `!==` on the two comparisons is what makes it a *crossing* test
 * rather than a "both above" one, and it is the line that is wrong in most
 * hand-written copies of this.
 */
function inRing(
  latitude: number,
  longitude: number,
  ring: [number, number][],
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [iLat, iLng] = ring[i];
    const [jLat, jLng] = ring[j];
    if (
      iLng > longitude !== jLng > longitude &&
      latitude <
        ((jLat - iLat) * (longitude - iLng)) / (jLng - iLng) + iLat
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * The sector a place is in, or undefined for a point outside all six.
 *
 * Undefined is a real answer and not a failure: a report filed just outside
 * the city, or by a client older than the bundled boundaries, has no sector.
 * The database treats such a report as reachable by every resolver rather than
 * by none -- a complaint nobody can be responsible for is worse than one two
 * people look at. See `may_resolve` in migration 0011.
 */
export function sectorOf(
  latitude: number,
  longitude: number,
): Jurisdiction | undefined {
  for (const sector of SECTORS) {
    if (sector.rings.some((ring) => inRing(latitude, longitude, ring))) {
      return sector.jurisdiction;
    }
  }
  return undefined;
}

/** What to call a jurisdiction on screen. */
export const jurisdictionLabel: Record<Jurisdiction, string> = {
  sector_1: "Sectorul 1",
  sector_2: "Sectorul 2",
  sector_3: "Sectorul 3",
  sector_4: "Sectorul 4",
  sector_5: "Sectorul 5",
  sector_6: "Sectorul 6",
  city: "București",
};

/**
 * What to call an institution on screen.
 *
 * The issue this implements is explicit about one of these and it is worth
 * repeating here, because it is the line somebody would smooth over: **do not
 * display "Poliția" unless the organisation was verified as an actual police
 * authority.** A label is a claim about power over a driver -- about who may
 * stop them, fine them, tow them -- and applying it to a contractor because
 * the word looked authoritative is a lie the app tells on somebody else's
 * behalf.
 *
 * So `other` reads as "Cont instituțional verificat": true, unhelpful, and
 * exactly as specific as the verification actually was.
 */
export const organisationKindLabel: Record<OrganisationKind, string> = {
  sector_hall: "Primărie de sector",
  local_police: "Poliția Locală",
  police: "Poliția Română",
  city_hall: "Primăria Capitalei",
  other: "Cont instituțional verificat",
};

/**
 * The institution and where it acts, as one line.
 *
 * The name first, because that is what somebody recognises; the reach after
 * it, because "Primăria Sectorului 2" already says where and a body called
 * "Poliția Locală" does not.
 */
export function describeOrganisation(org: {
  name: string;
  kind: OrganisationKind;
  jurisdiction: Jurisdiction;
}): string {
  const where = jurisdictionLabel[org.jurisdiction];

  /* Matched on the number rather than on the label, because Romanian declines
     it: a sector hall is "Primăria Sector**ului** 2", which does not contain
     the string "Sectorul 2". A plain `includes` therefore appends the reach to
     the one kind of name that already carries it, and the app says "Primăria
     Sectorului 2 · Sectorul 2" -- which is the app talking to itself. */
  const number = /sector_(\d)/.exec(org.jurisdiction)?.[1];
  const carriesIt = number
    ? new RegExp(`sector\\w*\\s*${number}\\b`, "i").test(org.name)
    : org.name.includes(where);

  return carriesIt ? org.name : `${org.name} · ${where}`;
}
