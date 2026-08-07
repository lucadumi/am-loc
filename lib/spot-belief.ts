/**
 * Bridging the belief model to the spots the app already has.
 *
 * `lib/spot-state.ts` works on reports: individual claims, each with an author
 * and a time. The seed data in `lib/api.ts` predates that and carries only a
 * flattened `status` plus `updatedAt`, which is one report with the reporter
 * thrown away.
 *
 * Rather than rewrite the fixtures, this reads the existing shape as the
 * single report it is, so every screen can ask how much to believe a spot
 * today and nothing has to wait for the backend. When reports become real
 * rows, `reportsFor` is the only function that has to change.
 */

import type {
  AvailabilityWindow,
  ParkingSpot,
  SpotSource,
} from "@/types";

import { loadWindowsBySpot } from "./availability-windows.ts";
import { declaredStatus, isPrivate, offeredAt, type SpotOffer } from "./private-spots.ts";
import { groupBySpot, loadReports, seedReport } from "./spot-reports.ts";

import {
  believe,
  describeConfidence,
  type ConfidenceLevel,
  type SpotBelief,
  type SpotReport,
} from "./spot-state.ts";

/** A spot together with what the app should actually claim about it. */
export interface BelievedSpot extends ParkingSpot {
  belief: SpotBelief;
  /** Which state to draw, so screens do not invent their own thresholds. */
  confidenceLevel: ConfidenceLevel;
  /** What the owner declared. Present only for private spots. */
  offer?: SpotOffer;
}

/**
 * What a belief adds to whatever kind of spot it was attached to.
 *
 * Generic so that a spot carrying extra fields keeps them: `rankNearby` hands
 * in spots with their distance and walk time already worked out, and losing
 * those to a widening cast would mean computing them twice.
 */
type Believed<T extends ParkingSpot> = T & {
  belief: SpotBelief;
  confidenceLevel: ConfidenceLevel;
  /** What the owner declared. Present only for private spots. */
  offer?: SpotOffer;
};

/**
 * Sources that record a place existing, rather than somebody observing it.
 *
 * The distinction the seed claim turns on. A driver dropping a pin is saying "I
 * am looking at this kerb and it is free"; OpenStreetMap saying a car park is
 * there is not saying anything at all about whether there is space in it, and
 * neither is CMPB saying it painted 104 bays on Strada Academiei.
 *
 * Read as an observation, an imported record would arrive as a fresh claim by
 * `anon:osm_w123` made at the moment the file was generated, and hundreds of car
 * parks nobody has ever looked at would show as confidently occupied, timestamped
 * this morning. `describeConfidence` already has the right word for what these
 * actually are, and it is "Fără raportări".
 */
const RECORDS: SpotSource[] = ["osm", "cmpb", "city"];

/**
 * Every report behind a spot: the claim its fields carry, plus anything
 * drivers have filed since.
 *
 * The seed is kept rather than replaced, because a newer report should have to
 * *outweigh* an older one rather than silently delete it. That is what makes a
 * spot show as contested when two people disagree, instead of simply flipping
 * to whoever spoke last.
 *
 * Unless it is already there. A spot loaded from Supabase has no status of its
 * own -- `spots` has no such column -- so its `status` and `updatedAt` are
 * flattened from the newest row of `status_reports`, and that same row also
 * arrives in `filed`. Reading the flattened copy as a separate claim would
 * count one observation twice and hand the newest reporter double weight in
 * every disagreement, which is exactly the "flips to whoever spoke last"
 * behaviour the seed was kept to prevent. One person cannot say the same thing
 * twice at the same instant, so an exact match on author and timestamp is the
 * duplicate rather than a coincidence.
 *
 * Or unless there was never an observation to flatten, which is the case for
 * anything imported from a dataset.
 */
export function reportsFor(spot: ParkingSpot, filed: SpotReport[] = []): SpotReport[] {
  if (spot.source && RECORDS.includes(spot.source)) return filed;

  const seed = seedReport(spot);
  const duplicated = filed.some(
    (report) => report.reporterId === seed.reporterId && report.at === seed.at
  );
  return duplicated ? filed : [seed, ...filed];
}

/**
 * A private spot with its owner's declaration folded into its own fields.
 *
 * Separate from `withDeclaration` because the status has to be settled before
 * any belief is attached: a space whose owner had opened it for the afternoon
 * must not read as taken to anything filtering on `status` alone.
 */
export function applyDeclaration<T extends ParkingSpot>(
  spot: T,
  windows: AvailabilityWindow[],
  now: Date,
): T & { offer: SpotOffer } {
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

/**
 * A private spot's answer, which does not come from the belief model at all.
 *
 * The owner's windows are turned into the same shape the rest of the app reads
 * -- a status, a confidence, a level to draw -- because every screen already
 * speaks that language and forking them all would be a worse outcome than
 * forking here. But the numbers are not estimates dressed up: confidence is 1
 * because the person who decides has said so, and `freshness` is 1 because a
 * decision does not age. `confidenceLevel` is `declared`, which is outside the
 * ladder of doubt rather than at the top of it.
 *
 * `status` on the spot itself is overwritten, not just the belief. Screens read
 * `spot.status` directly in half a dozen places -- the map's pin colour, the
 * home screen's filter, the saved list's badge -- and a spot whose two copies of
 * its own status disagreed would show as free on the map and taken on the card.
 */
function withDeclaration<T extends ParkingSpot>(
  spot: T,
  windows: AvailabilityWindow[],
  now: Date,
): Believed<T> {
  const declared = applyDeclaration(spot, windows, now);

  return {
    ...declared,
    belief: {
      status: declared.status,
      confidence: 1,
      freshness: 1,
      // One voice, and the only one entitled to speak. Corroboration is a
      // measure for claims that could be wrong; a declaration cannot be.
      corroboration: 1,
      stale: false,
      contested: false,
      margin: 1,
      /* No source, because there is no report to attribute. An owner's
         declaration is not a claim somebody made and could be wrong about, so
         there is nobody to credit it to. */
      source: null,
      considered: windows.length,
    },
    confidenceLevel: "declared",
  };
}

/**
 * Attach a belief to a spot.
 *
 * `now` is a parameter rather than read from the clock so screens can be
 * tested, and so a list rendered in one pass cannot have its rows disagree
 * about what time it is.
 *
 * The first line is the important one. A private spot never reaches `believe()`,
 * so no weight of stranger reports can move it, and a spot whose owner has said
 * nothing reads as taken rather than as free.
 */
export function withBelief<T extends ParkingSpot>(
  spot: T,
  now: Date = new Date(),
  filed: SpotReport[] = [],
  windows: AvailabilityWindow[] = []
): Believed<T> {
  if (isPrivate(spot)) return withDeclaration(spot, windows, now);
  const belief = believe(reportsFor(spot, filed), now);
  return {
    ...spot,
    /* How many spaces the last person to stand there counted. Only from a
       report that still carries weight: a count from three days ago is not a
       count of anything now, and showing it as "12 libere" beside a "Fără
       raportări" badge would be the two halves of the screen contradicting
       each other. */
    availableCount: belief.source?.spaces ?? spot.availableCount,
    belief,
    confidenceLevel: describeConfidence(belief),
  };
}

export function withBeliefs<T extends ParkingSpot>(
  spots: T[],
  now: Date = new Date(),
  filedBySpot: Map<string, SpotReport[]> = new Map(),
  windowsBySpot: Map<string, AvailabilityWindow[]> = new Map()
): Believed<T>[] {
  return spots.map((spot) =>
    withBelief(
      spot,
      now,
      filedBySpot.get(spot.id) ?? [],
      windowsBySpot.get(spot.id) ?? []
    )
  );
}

/**
 * Everything a screen needs to weigh the spots it just loaded: the reporter
 * records, the filed reports and the owners' windows, read together so a list
 * cannot be built from a half-loaded picture.
 */
export async function believeAll<T extends ParkingSpot>(
  spots: T[],
  now: Date = new Date()
): Promise<Believed<T>[]> {
  const [filed, windows] = await Promise.all([
    loadReports().then(groupBySpot),
    // Only asked for when something on the list actually has an owner, so the
    // public-only screens this app opens on pay nothing for the private half.
    spots.some(isPrivate) ? loadWindowsBySpot() : Promise.resolve(new Map()),
  ]);
  return withBeliefs(spots, now, filed, windows);
}

/**
 * Spots worth showing as live, best first.
 *
 * Stale ones are not dropped: a spot nobody has reported on for an hour is
 * still a place to look, and hiding it would leave the map emptier than the
 * street. They sort last and carry their label, so the screen can show them
 * differently rather than pretending they are current.
 */
export function rankByConfidence(spots: BelievedSpot[]): BelievedSpot[] {
  return [...spots].sort((a, b) => b.belief.confidence - a.belief.confidence);
}
