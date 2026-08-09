/**
 * Turning what a driver typed into a place on the map.
 *
 * "Piața Victoriei", "Spitalul Universitar", "Lipscani 12" -- the thing a
 * driver knows about where they are going -- into the coordinates that
 * `rankNearby` measures a walk from. This is the only piece of #14 the app did
 * not already have: the ranking has been written and tested since the start,
 * and has simply never been handed an origin other than the driver's own
 * position.
 *
 * NOMINATIM, AND WHAT IT COSTS TO USE IT POLITELY. OpenStreetMap's geocoder is
 * free and covers Bucharest, which is the whole of the service area. It is run
 * on donated hardware, so its usage policy is not a formality: identify
 * yourself, stay under one request a second, and cache. All three are honoured
 * below, and the same `User-Agent` shape the fetch scripts already use is
 * repeated here so a maintainer of theirs can see who is calling.
 *
 * The policy is also why the search is not typed-through-to-the-network on
 * every keystroke. `searchPlaces` is written to be called from a debounce, it
 * refuses to run two requests inside a second, and it answers repeats from
 * memory -- which matters more than politeness suggests, because the commonest
 * query in this app is a driver retyping the same square they park at daily.
 *
 * ATTRIBUTION IS REQUIRED, not optional, and `GEOCODER_ATTRIBUTION` is the
 * string any screen showing these results has to draw. The same rule the CMPB
 * layer already follows.
 */

import { BUCHAREST, isInBucharest, type LatLng } from "./geo.ts";

/** Required wherever a geocoded result is shown. */
export const GEOCODER_ATTRIBUTION = "Căutare © OpenStreetMap";

const ENDPOINT = "https://nominatim.openstreetmap.org/search";

/** Nominatim asks for one request a second. This is that, with room to spare. */
const MIN_INTERVAL_MS = 1100;

/** Below this, a query is too vague to spend a request on. */
const MIN_QUERY_LENGTH = 3;

/** How many suggestions are worth showing. More is a scroll, not a choice. */
const LIMIT = 6;

/**
 * A box around Bucharest, as `left,top,right,bottom`.
 *
 * Sent unbounded: it *prefers* local answers rather than forbidding distant
 * ones. Bounding it outright would be the tempting choice and is wrong at the
 * edges -- Otopeni airport and the ring-road retail parks sit outside any box
 * drawn tightly enough to be useful, and a driver searching for one of those is
 * asking a perfectly good question.
 */
const VIEWBOX = "25.95,44.55,26.25,44.32";

/** One place a driver might be going. */
export interface Place {
  /** Stable across renders; Nominatim's own id for the feature. */
  id: string;
  /** What to show in the list, e.g. "Piața Victoriei". */
  name: string;
  /** The rest of the address, e.g. "Sector 1, București". Possibly empty. */
  detail: string;
  latitude: number;
  longitude: number;
}

/** Raw Nominatim, as far as this module relies on it. */
interface NominatimPlace {
  place_id: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
}

/**
 * Split "Piața Victoriei, Sector 1, București, 010061, România" into the bit
 * worth reading and the bit worth showing underneath.
 *
 * Nominatim's `name` is the feature's own name when it has one and empty when
 * it does not, so a street address falls back to the first comma-separated
 * part -- which is the house number and street, and the right headline for it.
 *
 * The tail drops the country and the postcode. Everything this app can find is
 * in Romania, so "România" on every row is six characters of nothing, and a
 * postcode is not how anybody recognises a place they have been to.
 */
export function describePlace(raw: NominatimPlace): { name: string; detail: string } {
  const parts = raw.display_name.split(",").map((p) => p.trim()).filter(Boolean);
  const name = raw.name?.trim() || parts[0] || raw.display_name;
  const detail = parts
    .slice(parts[0] === name ? 1 : 0)
    .filter((p) => p !== "România" && p !== "Romania" && !/^\d{5,6}$/.test(p))
    .join(", ");
  return { name, detail };
}

/** Whether a query is worth a request at all. */
export function isSearchable(query: string): boolean {
  return query.trim().length >= MIN_QUERY_LENGTH;
}

/**
 * Results already fetched, keyed by the normalised query.
 *
 * Unbounded on purpose: an entry is a handful of strings, a session's worth of
 * searching is a few dozen of them, and evicting would only ever cause a
 * request the policy asked us not to make.
 */
const cache = new Map<string, Place[]>();

const normalise = (query: string) => query.trim().toLowerCase().replace(/\s+/g, " ");

let lastRequestAt = 0;

/** Anything the caller can do about a failed search. */
export class GeocodeError extends Error {}

/**
 * Places matching what the driver typed, best first.
 *
 * Returns `[]` for a query too short to bother with, so a caller can render the
 * empty state without a special case. Throws `GeocodeError` when the network or
 * Nominatim itself fails, because a search that silently returns nothing is
 * indistinguishable from a place that does not exist -- and those want
 * different words on screen.
 *
 * `signal` is threaded through so a caller can abandon a request whose answer
 * has already been overtaken by the next keystroke.
 */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<Place[]> {
  if (!isSearchable(query)) return [];

  const key = normalise(query);
  const hit = cache.get(key);
  if (hit) return hit;

  const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
    if (signal?.aborted) throw new GeocodeError("aborted");
    /* Re-checked after waiting, because the query ahead of us in the queue may
       have been for the same thing. */
    const late = cache.get(key);
    if (late) return late;
  }
  lastRequestAt = Date.now();

  const url =
    `${ENDPOINT}?q=${encodeURIComponent(query.trim())}` +
    `&format=jsonv2&addressdetails=0&limit=${LIMIT}` +
    `&countrycodes=ro&viewbox=${VIEWBOX}&bounded=0`;

  let raw: NominatimPlace[];
  try {
    const response = await fetch(url, {
      signal,
      headers: {
        // Nominatim rejects anonymous callers. Same shape as the fetch scripts.
        "User-Agent": "amloc (https://github.com/lucadumi/am-loc)",
        "Accept-Language": "ro",
      },
    });
    if (!response.ok) {
      throw new GeocodeError(`Nominatim answered ${response.status}`);
    }
    raw = (await response.json()) as NominatimPlace[];
  } catch (cause) {
    if (cause instanceof GeocodeError) throw cause;
    throw new GeocodeError("Nu am putut căuta acum.", { cause });
  }

  const places = toPlaces(raw);
  cache.set(key, places);
  return places;
}

/**
 * Nominatim's answer, as the list a driver reads.
 *
 * Local results first rather than only local results. A driver in Bucharest
 * searching "Unirii" means the square here, and the viewbox usually settles it
 * -- but when it does not, burying the answer under a village in another county
 * is worse than reordering, and dropping the village outright would break the
 * airport and the ring-road retail parks.
 */
export function toPlaces(raw: NominatimPlace[]): Place[] {
  return raw
    .map((place) => {
      const { name, detail } = describePlace(place);
      return {
        id: String(place.place_id),
        name,
        detail,
        latitude: Number(place.lat),
        longitude: Number(place.lon),
      };
    })
    .filter((place) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude))
    .sort(
      (a, b) =>
        Number(isInBucharest(b.latitude, b.longitude)) -
        Number(isInBucharest(a.latitude, a.longitude)),
    );
}

/** Where the map looks when nothing has been searched for. */
export const DEFAULT_ORIGIN: LatLng = {
  latitude: BUCHAREST.latitude,
  longitude: BUCHAREST.longitude,
};

/** Forget everything cached. For tests. */
export function clearGeocodeCache(): void {
  cache.clear();
  lastRequestAt = 0;
}
