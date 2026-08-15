/**
 * What a report says, to whom, and what may be done about it next.
 *
 * The Sesizări screens ask three questions over and over -- where did this
 * complaint get to, what may I see of it, and what may I do -- and all three
 * have answers that depend on who is asking. Kept here rather than in the
 * screens because the wrong answer to any of them is a privacy failure or a
 * dead button, and neither is visible in a component that renders fine.
 *
 * ---
 *
 * WHAT A STRANGER SEES OF SOMEBODY ELSE'S REPORT, which is the part worth
 * stating plainly.
 *
 * A blocked pavement is a public fact and the map is the point of filing it,
 * so the complaint itself is public: what was blocked, where, when, and where
 * it got to. The evidence is not. `0009` made the bucket private and the view
 * hands the photo paths only to their author, so a stranger cannot be shown a
 * photograph even by a screen that tried.
 *
 * The issue this implements asks for "redacted photos". There is no redaction
 * and there is not going to be one until something can blur a number plate --
 * a preview published as redacted that is not is worse than none, because the
 * driver believes the app protected them. So what a stranger gets is the
 * *count*: a complaint with four pictures behind it is a stronger complaint
 * than one with none, and saying so gives nothing away.
 *
 * Pure, with no runtime imports beyond the rights model, so `node --test`
 * loads it.
 */

import { holds, type Account } from "./roles.ts";
import type { BlockerReport, ReportStatus } from "@/types";

/** What each state is called, from the driver's side. */
export const reportStatusLabel: Record<ReportStatus, string> = {
  open: "Deschisă",
  forwarded: "Trimisă mai departe",
  /* "Semnalat liber" rather than "Rezolvată", and the difference is the whole
     of #12: somebody walked past and says the car has gone, which is worth
     knowing and is not an authority closing a file. */
  cleared: "Semnalat liber",
  resolved: "Rezolvată",
};

/**
 * What each state means, for the line under the badge.
 *
 * Written from the driver's point of view rather than the system's. "Open"
 * tells somebody who filed a complaint nothing; "nobody has acted on it yet"
 * tells them whether to expect anything.
 */
export const reportStatusMeaning: Record<ReportStatus, string> = {
  open: "Nimeni nu a preluat-o încă.",
  forwarded: "A ajuns la o instituție care poate acționa.",
  cleared: "Cineva a trecut pe acolo și spune că mașina nu mai e.",
  resolved: "O instituție a închis sesizarea.",
};

/**
 * Whether a report is still worth somebody's attention.
 *
 * `cleared` counts as settled for the purposes of a list -- the blockage is
 * reported gone -- while remaining reopenable, because a passer-by can be
 * wrong and the next event decides. Only `resolved` is closed by an authority.
 */
export function isSettled(report: Pick<BlockerReport, "status">): boolean {
  return report.status === "cleared" || report.status === "resolved";
}

/** Whether this account filed it. */
export function isMine(
  report: Pick<BlockerReport, "reportedBy">,
  account: Pick<Account, "id">,
): boolean {
  return report.reportedBy === account.id;
}

/**
 * Whether the evidence may be shown to this account at all.
 *
 * The author always; a resolver only through `evidence_paths`, which logs the
 * disclosure. Everybody else sees the count and nothing else -- and cannot be
 * shown more even by a screen that ignored this, because the paths never reach
 * them. This decides whether to *offer*, not whether it is permitted.
 */
export function mayViewEvidence(
  report: Pick<BlockerReport, "reportedBy" | "sector">,
  account: Account,
): boolean {
  if (isMine(report, account)) return true;
  if (!holds(account, "resolver")) return false;

  const office = account.organisation;
  if (!office) return false;
  return (
    office.jurisdiction === "city" ||
    !report.sector ||
    report.sector === office.jurisdiction
  );
}

/** What a driver may do to a report of their own. */
export function mayEdit(
  report: Pick<BlockerReport, "reportedBy" | "status">,
  account: Pick<Account, "id">,
): boolean {
  /* Not after somebody has said the blockage is gone. An edit changes what the
     complaint claims, and changing it under a photograph that answers the old
     claim would make the proof answer a question nobody asked. */
  return isMine(report, account) && !isSettled(report);
}

/**
 * How a list of reports should be ordered.
 *
 * Unsettled first, then newest. Not newest outright, which is the tempting
 * one: a list of complaints is a list of things that need doing, and burying
 * a week-old open report under this morning's cleared one is how the open ones
 * stop being looked at.
 */
export function compareForReader(a: BlockerReport, b: BlockerReport): number {
  const settled = Number(isSettled(a)) - Number(isSettled(b));
  if (settled) return settled;
  return b.createdAt.localeCompare(a.createdAt);
}

/**
 * The reports an office is answerable for.
 *
 * The client's echo of `may_resolve`. A city-wide body sees everything, a
 * sector hall sees its own sector, and a report the app could not place is
 * seen by everybody -- a complaint nobody is responsible for is worse than one
 * two people look at.
 *
 * Returns nothing at all for an account that is not an acting resolver, which
 * is what keeps the inbox from quietly becoming a second list of everything
 * for somebody who merely holds the grant.
 */
export function inboxFor(
  reports: BlockerReport[],
  account: Account,
): BlockerReport[] {
  if (!holds(account, "resolver")) return [];
  const office = account.organisation;
  if (!office) return [];

  return reports
    .filter(
      (report) =>
        office.jurisdiction === "city" ||
        !report.sector ||
        report.sector === office.jurisdiction,
    )
    .sort(compareForReader);
}

/** How many of these still need somebody. For the tab's badge. */
export function unsettledCount(reports: BlockerReport[]): number {
  return reports.filter((report) => !isSettled(report)).length;
}
