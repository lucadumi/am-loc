/**
 * Private spots: the ones somebody owns, and the ones only that somebody may
 * speak for.
 *
 * The app holds two species of fact about a piece of ground, and they are
 * separated because they answer to different authorities:
 *
 *   1. DECLARATIONS -- what an owner says about their own space. Authoritative
 *      for exactly one person, time-bounded, and it expires rather than decays.
 *      This module.
 *   2. OBSERVATIONS -- what a passer-by says about a public kerb. There are
 *      none. The app used to weigh strangers' claims against each other and no
 *      longer asks for any, so a public spot carries no availability at all:
 *      where it is, how big it is and what it costs, and nothing about whether
 *      there is room in it right now.
 *
 * ---
 *
 * WHY THERE IS ONLY ONE SPECIES LEFT. Arbitrating between strangers who cannot
 * all be right needs the strangers to be filing something, and it needs their
 * claims to be checkable by the next person to arrive. Neither held: nobody was
 * asked, and a claim about a car park is verifiable by nobody. Occupancy will
 * arrive from a ledger -- an operator's barrier, or the windows below -- and a
 * ledger does not contradict itself, so it needs no arbitrator at all. The
 * belief model was removed rather than left switched off.
 *
 * A declaration also does not decay, which is the other half of the same point.
 * A half-life applied to "free weekdays nine to five" would have the app
 * growing unsure, by half past ten, about a fact that has not changed and will
 * not until five.
 *
 * ---
 *
 * THE SPLIT IS ALSO A LEGAL BOUNDARY, WHICH IS WHY IT IS IN THE TYPES.
 *
 * Letting an owner offer their own space is lawful in Romania: a parking place
 * is property, and property may be lent or let (Cod Civil; Legea 196/2018 for
 * spaces inside a residents' association, whose own rules may still restrict
 * subletting a commonly-held one).
 *
 * Doing the same thing with a public kerb is not. "Reserving" or handing on a
 * space on the public road carries a contravention fine of 500-2.500 lei, and
 * obstructing a public road reaches art. 339 Cod Penal. This is the rock that
 * MonkeyParking ran onto in San Francisco, and Romanian law is if anything
 * plainer about it.
 *
 * So `mayDeclare` returning false for every public spot is not a product
 * decision that a later feature may reverse for convenience. It is the line
 * between a listing and an offence, and it is expressed as a total function over
 * `SpotAccess` so that adding a third kind of spot forces somebody to think
 * about which side of it they are on.
 *
 * Pure, with no runtime imports beyond the clock, so `node --test` loads it.
 */

import type { AvailabilityWindow, ParkingSpot } from "@/types";

import { windowState } from "./bucharest-time.ts";

/** What an owner is currently offering, if anything. */
export interface SpotOffer {
  /** Whether the owner is offering the space at this instant. */
  open: boolean;
  /**
   * ISO instant the answer changes.
   *
   * Absent means "not within the next few days", which for a spot whose last
   * window has already passed is the honest answer: never again unless the
   * owner says so.
   */
  until?: string;
  /** The window responsible, for attribution, price and instructions. */
  window: AvailabilityWindow | null;
  /** Lei per hour, taken from the open window. Absent means lent for free. */
  pricePerHour?: number;
}

/**
 * What the owner is saying about their space right now.
 *
 * The mirror of `believe(reports, now)`: same shape, same purity, different
 * authority. `when` is a parameter so a list rendered in one pass cannot have
 * its rows disagree about the time.
 */
export function offeredAt(
  windows: AvailabilityWindow[],
  when: Date = new Date(),
): SpotOffer {
  const state = windowState(windows, when);
  const window = state.window;

  return {
    open: state.open,
    ...(state.until === undefined ? {} : { until: state.until }),
    window,
    ...(state.open && window?.pricePerHour !== undefined
      ? { pricePerHour: window.pricePerHour }
      : {}),
  };
}

/**
 * A private spot with no windows at all is not on offer.
 *
 * Worth stating, because the tempting alternative is to treat "the owner has
 * not said anything" as "help yourself", which is the same mistake as reading
 * an unsurveyed kerb as free -- with a stranger's driveway attached to it.
 * Silence from an owner is a no.
 */
export const NOT_OFFERED: SpotOffer = { open: false, window: null };

/** Whether a spot is somebody's rather than everybody's. */
export function isPrivate(spot: Pick<ParkingSpot, "access">): boolean {
  return spot.access === "private";
}

/**
 * Whether this identity may set when a spot is free.
 *
 * The whole authority rule, in one expression, so that no screen has to
 * reconstruct it and get it subtly different. A public spot has no owner to
 * declare for it; a private one has exactly one.
 */
export function mayDeclare(
  spot: Pick<ParkingSpot, "access" | "ownerId">,
  identity: string,
): boolean {
  return spot.access === "private" && !!spot.ownerId && spot.ownerId === identity;
}

/**
 * Whether anybody may file an observation about a spot.
 *
 * No identity parameter, and that is the point: on a public kerb everyone may
 * speak, and on a private space nobody may -- including the owner, who has a
 * better instrument than looking out of the window. Taking an identity here
 * would invite a future caller to special-case the owner back in, which would
 * put the same fact into two tables that can then disagree.
 */
export function mayReport(spot: Pick<ParkingSpot, "access">): boolean {
  return spot.access === "public";
}

/**
 * The status a private spot should show, from what its owner declared.
 *
 * Only two answers, deliberately. `leaving` is a claim about the near future
 * made by somebody watching a kerb, and an owner who wants to say "in twenty
 * minutes" has a better way to say it: a window that starts then.
 */
export function declaredStatus(offer: SpotOffer): "free" | "taken" {
  return offer.open ? "free" : "taken";
}

/**
 * Windows the owner has set that have not already run out.
 *
 * For the owner's own list. A window whose `endsOn` is in the past is history,
 * and leaving it on screen makes the list grow forever with things that can
 * never happen again.
 */
export function liveWindows(
  windows: AvailabilityWindow[],
  today: string,
): AvailabilityWindow[] {
  return windows.filter((window) => !window.endsOn || window.endsOn >= today);
}

/** Sort windows the way an owner reads them: earliest in the day first. */
export function byStart(a: AvailabilityWindow, b: AvailabilityWindow): number {
  return a.from - b.from || a.to - b.to;
}

/**
 * A spot with whatever its owner has declared folded into its own fields.
 *
 * `offer` is present only for a private spot, because only a private spot has
 * anybody entitled to make one. A public spot passes through untouched and
 * carries no `status` at all -- see the header of this module and `ParkingSpot`
 * in @/types for why the app no longer claims one.
 */
export type OfferedSpot<T extends ParkingSpot = ParkingSpot> = T & {
  offer?: SpotOffer;
};

/**
 * Fold an owner's windows into the spot the screens read.
 *
 * `status` and `availableCount` are written onto the spot itself rather than
 * left on `offer`, because screens read those fields directly in half a dozen
 * places -- the map's pin colour, the card's badge -- and a spot whose two
 * copies of its own answer disagreed would show free on the map and taken on
 * the card.
 *
 * `now` is a parameter rather than read from the clock so screens can be tested,
 * and so a list rendered in one pass cannot have its rows disagree about what
 * time it is.
 */
export function applyDeclaration<T extends ParkingSpot>(
  spot: T,
  windows: AvailabilityWindow[],
  now: Date = new Date(),
): OfferedSpot<T> {
  if (!isPrivate(spot)) return spot;

  const offer = offeredAt(windows, now);
  const status = declaredStatus(offer);
  return {
    ...spot,
    status,
    /* The price rides on the window, not on the spot, because an owner may lend
       it free at the weekend and charge on weekdays. Falls back to whatever the
       spot carries so a listing with no per-window price still shows one. */
    pricePerHour: offer.pricePerHour ?? spot.pricePerHour,
    availableCount: status === "free" ? 1 : 0,
    offer,
  };
}

/** The same, for a list. */
export function applyDeclarations<T extends ParkingSpot>(
  spots: T[],
  windowsBySpot: Map<string, AvailabilityWindow[]> = new Map(),
  now: Date = new Date(),
): OfferedSpot<T>[] {
  return spots.map((spot) =>
    applyDeclaration(spot, windowsBySpot.get(spot.id) ?? [], now),
  );
}

/**
 * Load the owners' windows and fold them in.
 *
 * Only asked for when something on the list actually has an owner, so the
 * public-only screens this app opens on pay nothing for the private half.
 */
export async function withOffers<T extends ParkingSpot>(
  spots: T[],
  now: Date = new Date(),
): Promise<OfferedSpot<T>[]> {
  if (!spots.some(isPrivate)) return spots;
  const { loadWindowsBySpot } = await import("./availability-windows.ts");
  return applyDeclarations(spots, await loadWindowsBySpot(), now);
}
