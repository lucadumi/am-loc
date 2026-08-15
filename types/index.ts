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
 * Who controls a spot, and therefore what may lawfully be done with it.
 *
 * Three kinds, because Romanian law treats them as three, and re-exported from
 * `lib/spot-rights.ts` rather than declared here: the reasoning that makes the
 * distinction load-bearing is legal rather than structural, and it belongs
 * beside the capabilities it decides. Ask `rightsOf` before drawing anything
 * that lets somebody list, reserve or charge for a place.
 */
import type { Jurisdiction } from "@/lib/jurisdiction.ts";
import type { SpotAccess } from "@/lib/spot-rights.ts";

export type { SpotAccess };

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
   * What kind of place this is. Required, and deliberately so: every place
   * that builds a spot has to answer the question out loud, because the
   * default that gets forgotten is the one that lets somebody put a stretch of
   * public road up for rent.
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

/**
 * Where a report got to, derived from its newest event.
 *
 * `cleared` and `resolved` are the same claim -- the blockage is gone -- with
 * different standing behind it. A passer-by photographs a clear kerb; a sector
 * hall closes the file. Both are worth showing and they are not the same news,
 * which is why the app carries four values rather than folding the first into
 * the second. See `0011_institutional_resolvers.sql`.
 */
export type ReportStatus = "open" | "forwarded" | "cleared" | "resolved";

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
  /**
   * The institution that closed it, where one did.
   *
   * Absent for a passer-by's `cleared`, which is the whole difference between
   * the two: an official resolution is attributable to an office, and a
   * screen that named a uuid instead would be attributing a public act to a
   * private person.
   */
  byOrganisation?: string;
  /** True when a verified institution closed it, rather than a passer-by. */
  official: boolean;
}

/**
 * One thing somebody did about a report.
 *
 * The history is append-only and is the report's status: `toBlockerReport`
 * derives "where it got to" from the newest of these rather than from a
 * column, which is the one definition of "open" that cannot drift -- there is
 * nothing to forget to update.
 */
export interface ReportEvent {
  id: number;
  kind: Exclude<ReportStatus, "open">;
  /** Proof, for anything that closes a report. Empty for a forwarding. */
  photos: string[];
  /** The office, where an institution did it. Absent for a passer-by. */
  organisation?: string;
  /** An institution's own words. Absent for anything else. */
  note?: string;
  /** ISO timestamp. */
  at: string;
}

export interface BlockerReport {
  id: string;
  category: ReportCategory;
  latitude: number;
  longitude: number;
  /** ISO timestamp. */
  createdAt: string;
  status: ReportStatus;
  /**
   * Who filed it. Only its author may edit or withdraw it.
   *
   * Null for somebody else's report since `0012_privacy_lifecycle.sql`: the
   * view hands the id back only to the person it names. Every question the app
   * asks of this is "is this mine", so a null answers it correctly, and the
   * alternative was a column that let anybody group the city's complaints by
   * the person who filed them.
   */
  reportedBy: string | null;
  plate?: string;
  /**
   * The evidence, in the order it was taken.
   *
   * Storage paths once a report has been filed, local URIs while it is being
   * written, and absent entirely when the report is somebody else's -- the
   * bucket is private and the view hands the paths only to their author. See
   * lib/evidence.ts; `signEvidence` is what turns them into something an
   * `Image` can render.
   */
  photos?: string[];
  /**
   * How many photographs it carries, whoever is asking.
   *
   * Public where `photos` is not, and that split is the point: a complaint
   * with four pictures behind it is a stronger complaint than one with none,
   * and saying so gives nothing away.
   */
  photoCount?: number;
  note?: string;
  address?: string;
  /**
   * Which sector administration answers for this place.
   *
   * Placed on the device when the report is filed. Absent where the app could
   * not place it, which the schema treats as reachable by every resolver
   * rather than by none -- see lib/jurisdiction.ts.
   */
  sector?: Jurisdiction;
  /**
   * Everything anybody did about it, newest first.
   *
   * The status above is the newest of these; both are carried because a screen
   * usually wants the one and a detail screen wants all of them, and deriving
   * the status twice is how the badge and the timeline come to disagree.
   */
  history?: ReportEvent[];
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

/**
 * What somebody may be.
 *
 * Four values, and only three are ever granted -- see `ACCOUNT_GRANTS` in
 * lib/roles.ts. `user` is what you are for being signed in, so a grant saying
 * so would carry no information and its absence would be ambiguous.
 *
 * The Postgres enum of the same name carries the same four for the same
 * reason, so a value read out of `user_roles` maps across without translation.
 */
export type AccountRole = "user" | "host" | "resolver" | "admin";

/**
 * How strongly a session is authenticated.
 *
 * Supabase's own spelling, kept rather than renamed to something friendlier:
 * it is what arrives in the token's `aal` claim and what
 * `current_assurance_level` reads in SQL, and a second name for it would be a
 * second thing to keep in step. `aal1` is a password; `aal2` is a password and
 * a second factor.
 */
export type AssuranceLevel = "aal1" | "aal2";

/**
 * Who the app is acting as.
 *
 * Note what is absent. There is no "has enrolled a second factor" field, and
 * that is deliberate rather than an omission: what every capability turns on
 * is whether *this session* passed a challenge, not whether the account could
 * have. A field saying the account owns an authenticator would be exactly the
 * thing a future caller reached for to let a password-only session through.
 *
 * See lib/roles.ts for what any of it permits.
 */
export interface Account {
  /**
   * The uuid every foreign key in the schema already points at.
   *
   * Unchanged by signing up, which is the whole reason an anonymous driver
   * loses nothing by making an account: `updateUser` attaches an email to the
   * row that is already there rather than minting a second one.
   */
  id: string;
  /**
   * True while the person has no way back into their own account.
   *
   * An anonymous account is a full account in every respect that matters to
   * the rest of the schema -- it owns reports, it holds a uuid -- and is not a
   * person in the one respect that matters here: nobody can prove they are it.
   * Whoever holds the phone is them, and if the phone goes, they go.
   */
  anonymous: boolean;
  /** What has been granted, whether or not this session may exercise it. */
  grants: AccountRole[];
  assurance: AssuranceLevel;
  /**
   * Whether a confirmed authenticator exists on the account.
   *
   * Not a permission and never consulted as one -- `holds` turns on
   * `assurance`, which is about this session. What this decides is which
   * control to draw: somebody who enrolled a factor and signed in with only a
   * password needs to be offered the challenge, and an "add one" button would
   * be refused by the server and read as the app having lost their setup.
   */
  hasSecondFactor: boolean;
  /**
   * True between attaching an email and setting a password.
   *
   * The one state in which an account looks finished and is not: it has an
   * address, so `anonymous` is false, and nothing to sign in with, so signing
   * out would strand it. See `PENDING_PASSWORD_KEY` in lib/account.ts.
   */
  passwordPending: boolean;
  /** What to call them on screen. Absent until they say. */
  displayName?: string;
  /** The address they signed up with. Absent while anonymous. */
  email?: string;
  /**
   * ISO instant the profile row was made, which is the first time this device
   * asked the server who it was. Absent with no project, and on a project that
   * has not run `0008_accounts_and_roles.sql`.
   */
  since?: string;
  /** Whether they have declared they are acting commercially. */
  trader: boolean;
  /**
   * The institution a resolver acts for, where they are one.
   *
   * Absent for everybody else, and absent for a resolver whose organisation is
   * suspended or whose mandate has expired -- the same three ways to be unable
   * to act that `acting_organisation()` folds into one answer in SQL. A screen
   * that has this may draw the resolver's tools; one that does not, may not.
   */
  organisation?: Organisation;
}

/**
 * A body entitled to close complaints, and where.
 *
 * Public, and it has to be: a resolved report names the office that resolved
 * it, and a name nobody can look up is not attribution.
 */
export interface Organisation {
  id: string;
  name: string;
  kind: OrganisationKind;
  jurisdiction: Jurisdiction;
}

/**
 * What sort of body it is.
 *
 * `police` is never set for anything but an actual police authority, and the
 * label on screen turns on it: calling a contractor "Poliția" is a claim about
 * power over a driver that nobody made. Everything verified and unclassified
 * is `other`, which reads as "Cont instituțional verificat".
 */
export type OrganisationKind =
  | "sector_hall"
  | "local_police"
  | "police"
  | "city_hall"
  | "other";
