import { useEffect, useState } from "react";

import { CurrentLocation, getCurrentLocation } from "@/lib/location";

/**
 * Resolves the current (IP-based) location once on mount. Returns `null` while
 * loading, then a {@link CurrentLocation}. Never rejects; falls back to
 * Bucharest on failure.
 */
export function useCurrentLocation(): CurrentLocation | null {
  const [location, setLocation] = useState<CurrentLocation | null>(null);

  useEffect(() => {
    let alive = true;
    getCurrentLocation().then((loc) => {
      if (alive) setLocation(loc);
    });
    return () => {
      alive = false;
    };
  }, []);

  return location;
}
