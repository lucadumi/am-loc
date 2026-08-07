/**
 * How much to believe a parking report.
 *
 * Every other part of this app treats a spot's status as a fact: it is free,
 * or it is taken. It is not. It is someone's claim about a kerb in Bucharest,
 * made at a particular time by a particular person, and both of those change
 * what it is worth. A spot reported free thirty seconds ago by someone whose
 * last forty reports checked out is worth acting on. The same words from a new
 * account eleven minutes ago are worth very little, and showing them
 * identically is how a community map loses its users: they drive to three
 * ghost spots and stop opening the app.
 *
 * This module turns a pile of reports into a current best guess and a number
 * saying how much to trust it. Three ideas, in order of how much they matter:
 *
 *   1. Confidence decays with age, and how fast depends on what was claimed.
 *   2. A reporter's weight comes from their record, with new accounts treated
 *      as unknown rather than as trustworthy.
 *   3. Disagreement is resolved by weight, and how close the vote was is
 *      itself reported, because a 51/49 result should not be drawn like a
 *      certainty.
 *
 * Everything here is pure, so it can be tested without a device, a network, or
 * a clock.
 *
 * ---
 *
 * ON THE CONSTANTS. The half-lives and priors below are *assumptions*. They
 * are not fitted to anything, because this app has no observations yet, and
 * writing a decay curve does not conjure the data that would justify it. They
 * are stated as named constants with the reasoning attached so they can be
 * argued with, and `HALF_LIVES` in particular is the first thing that should
 * be replaced once real reports exist. The experiment that would replace it is
 * cheap and worth naming: log every report, then log whether the next driver
 * to arrive found the spot as described, and fit the survival curve of "free"
 * against elapsed time. Until that is done, nothing in this file should be
 * described as measured.
 */

import type { SpotStatus } from "@/types";

/**
 * How long a claim stays half believable, in minutes, by what was claimed.
 *
 * These differ on purpose, and the asymmetry is the whole point. A free spot
 * in a contested street is gone in minutes, because everyone else is looking
 * for it too, so "free" is the fastest-rotting claim in the app. "Taken" ages
 * far more slowly: whoever parked there is running an errand, and errands are
 * measured in tens of minutes. "Leaving" is different in kind rather than
 * degree, since it comes with its own expiry, and is handled separately below.
 *
 * Treating all three the same is the obvious implementation and it is wrong in
 * a way users would feel immediately: the map would keep showing free spots
 * long after they went, and would keep hiding spots that freed up ages ago.
 */
export const HALF_LIVES: Record<SpotStatus, number> = {
  free: 4,
  leaving: 6,
  taken: 25,
};

/** Below this share of its original weight, a claim is too old to act on. */
export const STALE_BELOW = 0.25;

/** One observation about one spot. */
export interface SpotReport {
  spotId: string;
  status: SpotStatus;
  /** ISO timestamp of the observation. */
  at: string;
  reporterId: string;
  /** Minutes until the reporter leaves, for status === "leaving". */
  leavingInMin?: number;
  /**
   * How many free spaces the reporter counted, where that is a sensible
   * question — a car park, not a single kerb space.
   *
   * Only ever filed by somebody who was physically there and has just left, so
   * it is a count rather than an impression. That is the whole reason it is on
   * a report and not on the spot: "there were four spaces" is something that
   * was true at a moment, by a person, and it ages exactly like the status it
   * arrives with.
   */
  spaces?: number;
}

/** What the app should currently show for a spot, and how sure it is. */
export interface SpotBelief {
  status: SpotStatus;
  /** 0–1. Freshness times the reporter's standing. Use it for ranking. */
  confidence: number;
  /** 0–1. Age alone, ignoring who said it. Use it for "is this old". */
  freshness: number;
  /**
   * How many reports that still carry weight back the winning status.
   *
   * This carries the confidence a reporter's record otherwise would: two
   * people saying the same thing is worth more than one, and unlike a
   * reputation it needs nobody to have a history. Informational rather than a
   * state of its own, so there is no "nobody has backed this" badge — with
   * first-hand reports there is no such condition. One driver who parked there
   * and left is not an unbacked rumour.
   */
  corroboration: number;
  /** True when nothing recent enough survives to be worth drawing as live. */
  stale: boolean;
  /** Reports that disagreed with the winner, and by how much it won. */
  contested: boolean;
  /** Weight of the winning status over the total, 0.5–1 when contested. */
  margin: number;
  /** The report the belief rests on, for attribution in the UI. */
  source: SpotReport | null;
  /** How many reports were considered. */
  considered: number;
}

const MINUTE = 60_000;

/** Minutes between two instants, never negative. */
export function minutesBetween(from: string, now: Date): number {
  const elapsed = (now.getTime() - new Date(from).getTime()) / MINUTE;
  // A clock skewed forward should not make a report *more* than fresh.
  return Math.max(0, elapsed);
}

/**
 * How much a claim is still worth after `ageMin` minutes.
 *
 * Exponential decay with a per-status half-life: at one half-life it is worth
 * half, at two a quarter. Exponential rather than linear because a claim never
 * becomes actively false at a stroke; it just stops being evidence, and a
 * linear curve would hit exactly zero at an arbitrary moment and imply
 * certainty in the other direction.
 */
export function freshness(status: SpotStatus, ageMin: number): number {
  const halfLife = HALF_LIVES[status];
  return Math.pow(0.5, ageMin / halfLife);
}

/**
 * A "leaving" report expires at the moment it names.
 *
 * Someone saying "leaving in 5" is making a claim about a future instant, not
 * a decaying claim about now. Before that instant it should not be treated as
 * free; after it, the report has said everything it has to say and the spot
 * reverts to unknown rather than staying "leaving" forever. The window is
 * generous on the far side because people are late.
 */
export function leavingWindow(report: SpotReport, now: Date): {
  due: boolean;
  overdue: boolean;
  minutesUntil: number;
} {
  const age = minutesBetween(report.at, now);
  const promised = report.leavingInMin ?? 0;
  const minutesUntil = promised - age;
  return {
    due: minutesUntil <= 0,
    overdue: minutesUntil < -promised - 5,
    minutesUntil,
  };
}

/**
 * Combine every report about one spot into what the app should show.
 *
 * Each report votes for its status with its freshness, and the heaviest status
 * wins. The margin is the winner's share of the total weight, so a spot two
 * people disagree about comes back flagged rather than silently resolved, and
 * the UI can draw the difference between "free" and "probably free, but someone
 * says otherwise".
 *
 * ---
 *
 * ON THE MISSING TRUST TERM. The obvious weight is `trust x freshness`, where
 * trust is the reporter's record. It is deliberately absent, for two reasons.
 *
 * The first is that it would not survive contact with a new app. A reputation
 * has to be earned from something, and with nothing yet to earn it from every
 * reporter sits at the opening prior for ever — one constant multiplying every
 * weight, which changes no ordering at all. What it does change is the
 * thresholds it is compared against, and a low enough prior would have every
 * spot in the city permanently read as unconfirmed, including one reported five
 * seconds ago.
 *
 * The second is that a reputation answers the wrong question. Whether a kerb is
 * free is a fact about the kerb, not about who is speaking; a claim needs
 * corroborating, which several independent voices do, rather than discounting
 * by author.
 */
export function believe(
  reports: SpotReport[],
  now: Date = new Date()
): SpotBelief {
  const empty: SpotBelief = {
    status: "taken",
    confidence: 0,
    freshness: 0,
    corroboration: 0,
    stale: true,
    contested: false,
    margin: 1,
    source: null,
    considered: 0,
  };
  if (reports.length === 0) return empty;

  const weights = new Map<SpotStatus, number>();
  let best: { report: SpotReport; weight: number } | null = null;
  let total = 0;

  for (const report of reports) {
    const age = minutesBetween(report.at, now);
    let weight = freshness(report.status, age);

    // A promise to leave that has come and gone tells us nothing further; keep
    // a little weight so a spot does not flicker to unknown the instant the
    // clock passes, then drop it once it is clearly overdue.
    if (report.status === "leaving") {
      const window = leavingWindow(report, now);
      if (window.overdue) weight = 0;
      else if (window.due) weight *= 0.5;
    }

    if (weight <= 0) continue;

    weights.set(report.status, (weights.get(report.status) ?? 0) + weight);
    total += weight;
    if (!best || weight > best.weight) best = { report, weight };
  }

  if (!best || total === 0) return { ...empty, considered: reports.length };

  let winner: SpotStatus = best.report.status;
  let winningWeight = 0;
  weights.forEach((weight, status) => {
    if (weight > winningWeight) {
      winningWeight = weight;
      winner = status;
    }
  });

  // The strongest single report *for the winning status*, which is the one
  // worth attributing in the UI. The heaviest report overall may have voted
  // for the loser.
  const source =
    reports
      .filter((report) => report.status === winner)
      .sort(
        (a, b) =>
          minutesBetween(a.at, now) - minutesBetween(b.at, now)
      )[0] ?? best.report;

  const margin = winningWeight / total;
  const confidence = Math.min(1, winningWeight);

  const backing = reports.filter((report) => report.status === winner);

  /* Age on its own, not through `confidence`. `confidence` is the *sum* of the
     backing reports' freshness, so two half-aged claims and one fresh one both
     score 1 — which is right for ranking and wrong for the word "stale". These
     are two questions with two answers: how long ago was the most recent voice,
     and how much do they add up to. */
  const freshest = Math.max(
    ...backing.map((report) => freshness(winner, minutesBetween(report.at, now))),
    0
  );

  /* Voices that still carry weight, not voices that ever spoke. A claim from
     three days ago has decayed past the point where floating point can tell it
     from zero, and corroborates nothing; counting it would let a spot look
     well-attested on the strength of people who looked at it last week. */
  const corroboration = backing.filter(
    (report) => freshness(winner, minutesBetween(report.at, now)) > 0
  ).length;

  return {
    status: winner,
    confidence,
    freshness: freshest,
    corroboration,
    stale: freshest < STALE_BELOW,
    contested: weights.size > 1,
    margin,
    source,
    considered: reports.length,
  };
}

/**
 * Which of the states the UI needs to draw differently.
 *
 * A key rather than a phrase, for the same reason `SpotStatus` is: the wording
 * lives in `constants/theme.ts` next to the other user-facing strings, in
 * Romanian, and this module stays free of anything that would need
 * translating.
 */
export type ConfidenceLevel =
  | "none"
  | "fresh"
  | "recent"
  | "aging"
  | "stale"
  | "disputed"
  /**
   * The owner said so.
   *
   * Not a degree of belief at all, which is why it sits outside the ladder
   * above rather than at the top of it. The others answer "how much should I
   * trust this stranger's claim"; this one says the question does not arise,
   * because the person who decides has spoken. Only ever produced for private
   * spots -- see lib/private-spots.ts.
   */
  | "declared";

/**
 * Bucket a belief, so screens are not left inventing their own thresholds and
 * drifting from this module's.
 *
 * `disputed` outranks the freshness buckets on purpose: a spot two people
 * actively disagree about should not be drawn as confident just because both
 * of them spoke recently.
 */
export function describeConfidence(belief: SpotBelief): ConfidenceLevel {
  /* "Nobody has said anything about this kerb" and "everything anybody said
     about it has expired" are different facts, and only the first is
     `none` — labelled "Fără raportări" on screen.
  
     They are easy to confuse here because both arrive with `source === null`.
     A claim's weight halves every few minutes, and `free` halves every four,
     so beyond about three days the exponent underflows to zero in floating
     point: every report is skipped, nothing wins, and the belief comes back
     empty even though somebody did stand on that street and file something.
     Reporting that as "no reports" is a small lie in the one direction this
     app cannot afford, because it is indistinguishable from a kerb the
     community has genuinely never looked at.
  
     `considered` is the honest witness: it counts what was weighed, not what
     survived. `source` is deliberately left null either way, so an expired
     claim still has nobody to credit and no standing to move — a driver
     arriving today must not move the record of somebody who said "free" three
     days ago. */
  if (belief.source === null) {
    return belief.considered > 0 ? "stale" : "none";
  }
  if (belief.stale) return "stale";
  if (belief.contested && belief.margin < 0.65) return "disputed";
  if (belief.freshness > 0.7) return "fresh";
  if (belief.freshness > 0.45) return "recent";
  return "aging";
}
