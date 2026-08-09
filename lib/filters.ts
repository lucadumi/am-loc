import { distanceMeters, formatDistance, type LatLng } from "@/lib/geo";
import { ParkingSpot, SpotFilters } from "@/types";

/**
 * Pure filtering layer for parking spots. The map/list screens keep a
 * {@link SpotFilters} in state and run their spots through {@link filterSpots};
 * everything here is UI-free so it can be unit-tested and reused.
 */

/** Price slider bounds (lei / hour). The top value means "no upper limit". */
export const PRICE_MIN = 0;
export const PRICE_MAX = 20;
export const PRICE_STEP = 1;

/** Distance slider bounds (meters). The top value means "any distance". */
export const DISTANCE_MIN = 500;
export const DISTANCE_MAX = 5000;
export const DISTANCE_STEP = 250;

/** The unfiltered state: every group at its default, nothing excluded. */
export const DEFAULT_FILTERS: SpotFilters = {
  kinds: [],
  maxDistance: null,
  priceRange: [PRICE_MIN, PRICE_MAX],
  minRating: 0,
};

/** True when the price range is narrower than the full [MIN, MAX] span. */
function isPriceRangeActive([lo, hi]: [number, number]): boolean {
  return lo > PRICE_MIN || hi < PRICE_MAX;
}

/** Number of filter groups that deviate from their defaults (for a badge). */
export function countActiveFilters(f: SpotFilters): number {
  let n = 0;
  if (f.kinds.length) n++;
  if (f.maxDistance != null) n++;
  if (isPriceRangeActive(f.priceRange)) n++;
  if (f.minRating > 0) n++;
  return n;
}

/**
 * Keep only the spots matching every active filter. Distance is applied only
 * when an `origin` is known; free street spots count as price 0.
 */
/* Generic so a spot carrying extra fields keeps them through filtering.
   Typed as `ParkingSpot[] -> ParkingSpot[]` the values survive at runtime but
   vanish from the type, which is how a screen silently loses access to them. */
export function filterSpots<T extends ParkingSpot>(
  spots: T[],
  f: SpotFilters,
  origin?: LatLng | null,
): T[] {
  const [minPrice, maxPrice] = f.priceRange;
  return spots.filter((s) => {
    if (f.kinds.length && !f.kinds.includes(s.kind ?? "street")) return false;

    const price = s.pricePerHour ?? 0;
    if (price < minPrice) return false;
    if (maxPrice < PRICE_MAX && price > maxPrice) return false;

    if (f.minRating > 0 && (s.rating ?? 0) < f.minRating) return false;

    if (f.maxDistance != null && origin) {
      const d = distanceMeters(
        origin.latitude,
        origin.longitude,
        s.latitude,
        s.longitude,
      );
      if (d > f.maxDistance) return false;
    }
    return true;
  });
}

/** Human label for the current max-distance selection. */
export function distanceLabel(maxDistance: number | null): string {
  if (maxDistance == null) return "Orice distanță";
  return `Sub ${formatDistance(maxDistance)}`;
}

/** Human label for the current price range. */
export function priceLabel([lo, hi]: [number, number]): string {
  if (!isPriceRangeActive([lo, hi])) return "Orice preț";
  const top = hi >= PRICE_MAX ? "20+" : `${hi}`;
  if (lo === PRICE_MIN) return `Sub ${top} lei/oră`;
  return `${lo}–${top} lei/oră`;
}

/** Romanian-aware "N locuri" label (ignores the 20+ "de locuri" nicety). */
export function spotCountLabel(n: number): string {
  return `${n} ${n === 1 ? "loc" : "locuri"}`;
}
