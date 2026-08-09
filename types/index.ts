/**
 * Whether a space is free, and the only spots that have one.
 *
 * Present on a private spot alone, derived from its owner's windows by
 * `applyDeclaration`. A public spot has no status at all: nobody is asked, and
 * the app would rather say nothing than draw a colour on no evidence. There is
 * no `leaving` because an owner who means "in twenty minutes" has a better way
 * to say it -- a window that starts then.
 */
export type SpotStatus = "free" | "taken";

/** Street spot (single/few kerb spaces) vs a structured garage with slots. */
export type SpotKind = "street" | "garage";

/**
 * Who controls a spot, and therefore who is allowed to say whether it is free.
 *
 * This is the app's central distinction, not a label. A public kerb space
 * belongs to nobody, so what is known about it is what passers-by have claimed,
 * and the app no longer claims to know: nobody is asked, so it carries no
 * availability at all.
 *
 * A private space belongs to somebody. Its owner does not *observe* that it is
 * free, they *decide* it, and a stranger's opinion about it is worth nothing at
 * all -- not less, nothing. Running an owner's decision through a model built to
 * arbitrate between strangers would be a category error, and would let anyone
 * with the app mark somebody's garage occupied.
 *
 * So: `public` availability is believed, `private` availability is declared.
 * See lib/private-spots.ts.
 */
export type SpotAccess = "public" | "private";

/**
 * Where a spot came from, which is not the same as who may speak about it.
 *
 * Kept because the honest answer to "how do you know this space exists" differs
 * enormously between a municipal dataset and a stranger dropping a pin, and the
 * app should be able to say which.
 */
export type SpotSource =
  /** Derived from OpenStreetMap. */
  | "osm"
  /**
   * Compania Municipală Parking București: the blue zone, as the municipal
   * company that runs it publishes it. A record of a space it operates and
   * what it charges, never of whether anybody is in it.
   */
  | "cmpb"
  /** From a city or sector dataset. */
  | "city"
  /** A driver dropped a pin on a public kerb. */
  | "community"
  /** Listed by the person who owns it. */
  | "owner";

export interface ParkingSpot {
  id: string;
  /** Human label, e.g. a street name. */
  title: string;
  /**
   * Who may say whether this is free. Required, and deliberately so: every
   * place that builds a spot has to answer the question out loud, because the
   * default that gets forgotten is the one that lets a stranger mark somebody's
   * garage occupied.
   */
  access: SpotAccess;
  /**
   * Whether it is free, for a private spot only.
   *
   * Absent on a public one, and that absence is the honest answer rather than a
   * gap: nobody counts a public car park for this app, so it has nothing to say
   * about whether there is room. Derived for a private spot from its owner's
   * windows by `applyDeclaration` in lib/private-spots.ts.
   */
  status?: SpotStatus;
  latitude: number;
  longitude: number;
  /** "street" (default) or "garage". */
  kind?: SpotKind;
  /**
   * Free spaces right now, where somebody is entitled to say.
   *
   * Only ever set for a private spot, from its owner's own windows. A public
   * car park has no such number and none is invented for it.
   */
  availableCount?: number;
  /** Total capacity (mainly for garages). */
  totalCount?: number;
  /**
   * Price in RON per hour, when it is actually known.
   *
   * Undefined means unknown, which is not the same as free -- see `paid`.
   * Reading it as free would be tolerable if every spot were a hand-written
   * seed; against a hundred imported car parks it would have the app quoting
   * "0 lei / oră" for a hundred places that charge.
   */
  pricePerHour?: number;
  /**
   * Whether the place charges at all, when that much is known.
   *
   * A separate question from how much, and the only one OpenStreetMap answers:
   * `fee=yes` says a car park charges without saying the tariff. Three states
   * on purpose -- charges, does not charge, and nobody has said.
   */
  paid?: boolean;
  /** Community rating 0–5 (mock; real reviews later). */
  rating?: number;
  /** Neighborhood / area subtitle, e.g. "Sector 1 · Centru". */
  area?: string;
  /** Optional real photo URL; when absent the UI shows a branded placeholder. */
  imageUrl?: string;
  /** Where the app learned this space exists. */
  source?: SpotSource;
  /**
   * Who owns it, for `access === "private"`. The only person whose word about
   * its availability counts, and the only one allowed to change its windows.
   */
  ownerId?: string;
  /** What to call the owner on screen. */
  ownerName?: string;
}

/**
 * A stretch of time an owner is offering their space.
 *
 * The private half of the app's answer to "is it free", and a different species
 * of fact from a status report. A report is evidence and rots: somebody looked
 * at a kerb, and the longer ago that was the less it is worth. A window is a
 * decision and does not rot -- it simply stops. "Free weekdays nine to five" is
 * not less true at half four than it was at ten past nine; at one minute past
 * five it is over.
 *
 * Which is why this carries no confidence, no reporter and no decay. It is a
 * window on a Bucharest wall clock, evaluated by `windowState` in
 * lib/bucharest-time.ts.
 */
export interface AvailabilityWindow {
  id: string;
  spotId: string;
  /** Minutes from local midnight it opens, e.g. 540 for 09:00. */
  from: number;
  /** Minutes from local midnight it closes. May be <= `from` for overnight. */
  to: number;
  /** Weekdays it repeats on, 0 = Sunday … 6 = Saturday. Absent = every day. */
  days?: number[];
  /** First Bucharest date (YYYY-MM-DD) it applies. Absent = already running. */
  startsOn?: string;
  /** Last Bucharest date it applies. Absent = until the owner removes it. */
  endsOn?: string;
  /** Lei per hour the owner asks. Absent means they are lending it for free. */
  pricePerHour?: number;
  /** Anything the driver needs to know: gate code, which bay, how to get in. */
  note?: string;
}

/**
 * Active filters for the spot list / map. Empty arrays mean "no restriction";
 * `maxDistance === null` means any distance; a `priceRange` at its full bounds
 * means any price. See lib/filters.ts for the defaults and the pure predicate.
 */
export interface SpotFilters {
  /** Spot kinds to keep; empty = all kinds. */
  kinds: SpotKind[];
  /** Max distance from the user in meters; null = any distance. */
  maxDistance: number | null;
  /** Inclusive [min, max] price per hour in lei; max at its bound = no cap. */
  priceRange: [number, number];
  /** Minimum community rating; 0 = any. */
  minRating: number;
}

export type ReportCategory =
  | "sidewalk"
  | "ramp"
  | "crosswalk"
  | "bikelane"
  | "doublepark";

export type ReportStatus = "open" | "forwarded" | "resolved";

/**
 * What was filed to close a report: proof the car has gone.
 *
 * A blockage that "was resolved" because somebody tapped a button is a claim,
 * not a fact, and it is the one claim nobody can check afterwards: the car has
 * left either way. So closing a report costs the same thing opening it did, a
 * photograph of the place, taken by somebody who is named.
 */
export interface ReportResolution {
  /** At least one photo showing the kerb is clear. */
  photos: string[];
  /** ISO timestamp. */
  at: string;
  /** Who says it is clear. */
  by: string;
}

export interface BlockerReport {
  id: string;
  category: ReportCategory;
  latitude: number;
  longitude: number;
  /** ISO timestamp. */
  createdAt: string;
  status: ReportStatus;
  /** Who filed it. Only its author may edit or withdraw it. */
  reportedBy: string;
  plate?: string;
  /** Local URIs of the photos attached, in the order they were taken. */
  photos?: string[];
  note?: string;
  address?: string;
  /** Present once somebody has shown the blockage is gone. */
  resolution?: ReportResolution;
}

export const REPORT_CATEGORIES: {
  key: ReportCategory;
  label: string;
  description: string;
}[] = [
  {
    key: "sidewalk",
    label: "Trotuar blocat",
    description: "Mașină parcată pe trotuar",
  },
  {
    key: "ramp",
    label: "Rampă acces",
    description: "Blochează rampa pentru persoane cu dizabilități",
  },
  {
    key: "crosswalk",
    label: "Trecere de pietoni",
    description: "Parcat pe sau lângă trecere",
  },
  {
    key: "bikelane",
    label: "Pistă de biciclete",
    description: "Blochează pista de biciclete",
  },
  {
    key: "doublepark",
    label: "Parcare dublă",
    description: "Blochează banda de circulație",
  },
];
