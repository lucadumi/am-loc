/** Center of Bucharest (Piața Universității), used as the default map region. */
export const BUCHAREST = {
  latitude: 44.4353,
  longitude: 26.1028,
  latitudeDelta: 0.045,
  longitudeDelta: 0.045,
};

/** Radius (m) around the Bucharest center that counts as "in Bucharest". */
const BUCHAREST_RADIUS_M = 20000;

/** Great-circle distance between two coordinates, in meters. */
export function distanceMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Whether a coordinate falls within the Bucharest service area. */
export function isInBucharest(latitude: number, longitude: number): boolean {
  return (
    distanceMeters(BUCHAREST.latitude, BUCHAREST.longitude, latitude, longitude) <=
    BUCHAREST_RADIUS_M
  );
}

/** Human-friendly distance label, e.g. "120 m" or "1.4 km". */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * What a spot costs, in the app's own words.
 *
 * FOUR STATES, NOT THREE, and the fourth is the one that has to be said out
 * loud. Bucharest is precisely the city where it matters: a stretch of kerb is
 * either the 5 lei/h blue zone, a sector residents' permit or genuinely free,
 * and the three are told apart by a sign rather than by a dataset. So an
 * unknown price is never rendered as zero, and "charges" is never rendered as
 * "free".
 *
 * "Cu plată" is deliberately not "Cu plată · tarif necunoscut". The second half
 * was true and useless: a driver reading "cu plată" already knows the app has
 * not told them the amount, so spelling out the absence only made the longest
 * label in the app out of the least information in it. What is left says the
 * one thing that changes a decision -- that this place charges.
 *
 * The bare unknown keeps its qualifier, because there the missing word is the
 * whole message: nobody has said whether it charges at all, and shortening it
 * to "Tarif" or dropping it would read as free.
 */
export function formatPrice(
  pricePerHour: number | undefined,
  paid: boolean | undefined,
): string {
  if (pricePerHour !== undefined) return `${pricePerHour} lei / oră`;
  if (paid === true) return "Cu plată";
  if (paid === false) return "Gratuit";
  return "Tarif necunoscut";
}

/** Format coordinates like the mockup's location pill. */
export function formatCoords(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/** Clock label (HH:MM) for an ISO timestamp, e.g. "14:30". */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A coordinate. The app's one spelling of the pair, so a function taking a
    place cannot drift from a function returning one. */
export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Assumed average speeds for ETA estimates (m/s), tuned for central Bucharest. */
const WALK_SPEED_MPS = 1.35; // ~4.9 km/h
const DRIVE_SPEED_MPS = 5.2; // ~19 km/h in city traffic

/**
 * Estimated travel time in minutes for a straight-line distance, with a 1.3×
 * detour factor since real streets are never a straight line.
 */
export function etaMinutes(meters: number, mode: "walk" | "drive" = "drive"): number {
  const speed = mode === "walk" ? WALK_SPEED_MPS : DRIVE_SPEED_MPS;
  return Math.max(1, Math.round((meters * 1.3) / speed / 60));
}
