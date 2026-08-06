import { BUCHAREST, isInBucharest } from "@/lib/geo";

export interface CurrentLocation {
  latitude: number;
  longitude: number;
  city?: string;
  region?: string;
  country?: string;
  /** Human-friendly place label, e.g. "Măgurele, România". */
  label: string;
  /**
   * Where the fix came from.
   *
   * Worth keeping apart because the three are metres, kilometres and nothing.
   * A screen that ranks kerbs by how far away they are is only telling the
   * truth on `gps`.
   */
  source: "gps" | "ip" | "fallback";
}

/** Bucharest fallback used when the network lookup fails (offline, rate-limited…). */
const FALLBACK: CurrentLocation = {
  latitude: BUCHAREST.latitude,
  longitude: BUCHAREST.longitude,
  city: "București",
  country: "România",
  label: "București, România",
  source: "fallback",
};

const IP_ENDPOINT = "https://ipwho.is/";
const TIMEOUT_MS = 7000;

interface IpWhoResponse {
  success?: boolean;
  latitude?: number;
  longitude?: number;
  city?: string;
  region?: string;
  country?: string;
}

function localizeCountry(country?: string): string | undefined {
  if (!country) return undefined;
  return country === "Romania" ? "România" : country;
}

/** Romanian city names returned in English by the IP geolocation API. */
const CITY_RO: Record<string, string> = {
  Bucharest: "București",
};

function localizeCity(city?: string): string | undefined {
  if (!city) return undefined;
  return CITY_RO[city] ?? city;
}

function toLabel(city?: string, region?: string, country?: string): string {
  const place = localizeCity(city) || region;
  const nation = localizeCountry(country);
  if (place && nation) return `${place}, ${nation}`;
  return place || nation || "Locație necunoscută";
}

/**
 * The device's own position, when it will give one.
 *
 * The import is dynamic because the pure half of this module is unit-tested in
 * bare Node, where `expo-location` cannot load. A refusal is not an error: a
 * driver who declines the prompt gets the city-level answer below, not a broken
 * screen.
 *
 * The Bucharest check is what makes this safe on the iOS Simulator, which
 * reports the simulator's configured location — Cupertino by default — rather
 * than the Mac's. A fix in California is not a better answer than the IP one,
 * so it is discarded.
 */
async function gpsLocation(): Promise<CurrentLocation | null> {
  try {
    const Location = await import("expo-location");
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;

    const fix = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const { latitude, longitude } = fix.coords;
    if (!isInBucharest(latitude, longitude)) return null;

    return {
      latitude,
      longitude,
      city: "București",
      country: "România",
      label: "Locația ta",
      source: "gps",
    };
  } catch {
    return null;
  }
}

/**
 * Where the driver is, as precisely as this device will admit.
 *
 * GPS first, because the whole point of the home screen is which kerbs are
 * nearest and an IP fix lands a suburb away at best — far enough to reorder
 * every result on the page.
 *
 * Then the public IP, which needs no permission and works on the Simulator.
 * Then the middle of Bucharest, which is not where anybody is but is a map
 * worth opening.
 */
export async function getCurrentLocation(): Promise<CurrentLocation> {
  const gps = await gpsLocation();
  if (gps) return gps;
  return ipLocation();
}

async function ipLocation(): Promise<CurrentLocation> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(IP_ENDPOINT, { signal: controller.signal });
    if (!res.ok) return FALLBACK;
    const data = (await res.json()) as IpWhoResponse;
    if (
      data.success === false ||
      typeof data.latitude !== "number" ||
      typeof data.longitude !== "number"
    ) {
      return FALLBACK;
    }
    // The app only serves Bucharest; anywhere else is treated as the city center.
    if (!isInBucharest(data.latitude, data.longitude)) {
      return FALLBACK;
    }
    return {
      latitude: data.latitude,
      longitude: data.longitude,
      city: localizeCity(data.city),
      region: data.region,
      country: localizeCountry(data.country),
      label: toLabel(data.city, data.region, data.country),
      source: "ip",
    };
  } catch {
    return FALLBACK;
  } finally {
    clearTimeout(timer);
  }
}
