/**
 * Turning database rows into the shapes the app already speaks.
 *
 * Everything here is pure and imports nothing at runtime, which is the point:
 * the mapping is the part most likely to be wrong, and it is the part that
 * would otherwise need a live Postgres to test. Kept apart from
 * `lib/supabase.ts`, it can be checked with plain objects and no network, no
 * device and no credentials.
 *
 * The one genuinely interesting decision in this file is what a spot's
 * `status` means, and it is explained at `toParkingSpot`.
 */

import type { AvailabilityWindow, BlockerReport, ParkingSpot } from "@/types";
import type {
  AvailabilityWindowInsert,
  AvailabilityWindowRow,
  ReportEventRow,
  ReportInsert,
  ReportRow,
  SpotInsert,
  SpotRow,
  StatusReportRow,
} from "@/types/database.ts";

import type { SpotReport } from "./spot-state.ts";

/** Postgres says `null`; the app's optional fields say `undefined`. */
const optional = <T>(value: T | null): T | undefined =>
  value === null ? undefined : value;



/** One row of `status_reports` as the claim the belief model understands. */
export function toSpotReport(row: StatusReportRow): SpotReport {
  return {
    spotId: row.spot_id,
    status: row.status,
    at: row.created_at,
    reporterId: row.reporter_id,
    leavingInMin: optional(row.leaving_in_min),
    spaces: optional(row.spaces),
  };
}



/**
 * The newest claim per spot.
 *
 * Ordering is done here rather than trusted from the query, because a mapping
 * that is only correct when the caller remembered `order by created_at desc`
 * is a trap for the next person to write a query.
 */
export function latestBySpot(
  rows: StatusReportRow[],
): Map<string, StatusReportRow> {
  const latest = new Map<string, StatusReportRow>();
  for (const row of rows) {
    const current = latest.get(row.spot_id);
    if (!current || Date.parse(row.created_at) > Date.parse(current.created_at)) {
      latest.set(row.spot_id, row);
    }
  }
  return latest;
}

/**
 * A spot row, flattened into the `ParkingSpot` the screens read.
 *
 * `spots` deliberately has no status column: a spot's status is not a property
 * of the kerb, it is the current state of an argument about it. But filters,
 * lists and ranking all read `spot.status`, so the newest claim is flattened
 * back onto the spot here, exactly as the seed fixtures already carry one.
 *
 * **A spot nobody has reported on reads as `taken`, as of the moment it was
 * added.** Both alternatives are worse. Calling it `free` advertises a space
 * on no evidence whatsoever, which is precisely the failure that empties a
 * community map of its users. Inventing an "unknown" status would mean
 * touching every screen that switches on the three the app has. Marking it
 * taken keeps it off the "free spots" lists while leaving it on the map, and
 * because `updatedAt` is the spot's own creation time, the belief model ages
 * the non-claim out to `stale` on its own and draws it hollow. The map ends up
 * saying "somebody added this and nobody has checked it", which is true.
 *
 * **That placeholder is attributed to nobody, deliberately.** `reportedBy`
 * looks like a harmless thing to fall back to `created_by` for, and it is not:
 * `seedReport` would turn the invented "taken" into a claim authored by
 * whoever added the spot, and `believe` would hand it back as `belief.source`
 * -- an attribution the UI shows and anything built on top of it would credit.
 * Bulk-adding spots would then manufacture authorship of claims nobody made.
 * Left undefined, the invented claim has no author, which is the truth.
 */
export function toParkingSpot(
  row: SpotRow,
  latest?: StatusReportRow,
): ParkingSpot {
  /* A row that does not say is a public kerb. Defaulting the other way would
     turn anything unmarked into somebody's private property that nobody may
     report on, and quietly empty the map. */
  const access = row.access ?? "public";

  return {
    id: row.id,
    title: row.title,
    access,
    kind: row.kind,
    source: optional(row.source),
    area: optional(row.area),
    latitude: row.latitude,
    longitude: row.longitude,
    /* A private spot's status is not read from reports at all -- there are
       none, and a stranger may not file any. It is left shut here and
       overwritten by `withBelief` from the owner's windows, so a spot whose
       owner has offered nothing reads as taken rather than as free. */
    status: access === "private" ? "taken" : (latest?.status ?? "taken"),
    updatedAt: latest?.created_at ?? row.created_at,
    leavingInMin: latest ? optional(latest.leaving_in_min) : undefined,
    reportedBy: access === "private" ? undefined : latest?.reporter_id,
    ownerId: optional(row.owner_id),
    ownerName: optional(row.owner_name),
    totalCount: optional(row.total_count),
    pricePerHour: optional(row.price_per_hour),
    rating: optional(row.rating),
    imageUrl: optional(row.image_url),
  };
}

/** Spot rows plus the claims made about them, joined in one pass. */
export function toParkingSpots(
  rows: SpotRow[],
  reports: StatusReportRow[],
): ParkingSpot[] {
  const latest = latestBySpot(reports);
  return rows.map((row) => toParkingSpot(row, latest.get(row.id)));
}


/** A new spot's columns, from what `addSpot` was handed. */
export function toSpotInsert(spot: ParkingSpot, createdBy: string): SpotInsert {
  return {
    id: spot.id,
    title: spot.title,
    access: spot.access,
    kind: spot.kind ?? "street",
    source: spot.source ?? null,
    /* The owner is only ever this account. A client that could name somebody
       else as owner could list a stranger's garage and then be the only one
       allowed to say when it is free; the insert policy in Postgres refuses it
       too, and this is the copy that keeps the client from trying. */
    owner_id: spot.access === "private" ? createdBy : null,
    owner_name: spot.access === "private" ? (spot.ownerName ?? null) : null,
    area: spot.area ?? null,
    latitude: spot.latitude,
    longitude: spot.longitude,
    price_per_hour: spot.pricePerHour ?? null,
    total_count: spot.totalCount ?? null,
    rating: spot.rating ?? null,
    image_url: spot.imageUrl ?? null,
    created_by: createdBy,
  };
}

/** An availability window as its row, and back. */
export function toAvailabilityWindow(
  row: AvailabilityWindowRow,
): AvailabilityWindow {
  return {
    id: row.id,
    spotId: row.spot_id,
    from: row.from_minute,
    to: row.to_minute,
    days: row.days ?? undefined,
    startsOn: optional(row.starts_on),
    endsOn: optional(row.ends_on),
    pricePerHour: optional(row.price_per_hour),
    note: optional(row.note),
  };
}

export function toAvailabilityWindows(
  rows: AvailabilityWindowRow[],
): AvailabilityWindow[] {
  return rows.map(toAvailabilityWindow);
}

export function toWindowInsert(
  window: AvailabilityWindow,
  ownerId: string,
): AvailabilityWindowInsert {
  return {
    id: window.id,
    spot_id: window.spotId,
    from_minute: window.from,
    to_minute: window.to,
    days: window.days ?? null,
    starts_on: window.startsOn ?? null,
    ends_on: window.endsOn ?? null,
    price_per_hour: window.pricePerHour ?? null,
    note: window.note ?? null,
    owner_id: ownerId,
  };
}

/**
 * The newest event per report, and every event under it.
 *
 * Same shape as `latestBySpot` and for the same reason: a mapping that is only
 * correct when the caller remembered to order the query is a trap.
 */
export function eventsByReport(
  rows: ReportEventRow[],
): Map<string, ReportEventRow[]> {
  const byReport = new Map<string, ReportEventRow[]>();
  for (const row of rows) {
    const existing = byReport.get(row.report_id);
    if (existing) existing.push(row);
    else byReport.set(row.report_id, [row]);
  }
  for (const events of byReport.values()) {
    events.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }
  return byReport;
}

/**
 * A report row plus its history, flattened into the `BlockerReport` screens
 * read.
 *
 * **A report with no events is open**, which is the one definition of "open"
 * that cannot drift from the truth: there is no column to forget to update.
 * The newest event decides the rest, so a report forwarded on Monday and shown
 * to be clear on Tuesday is resolved, and one that was closed and then
 * forwarded again reads as forwarded, which is exactly what happened to it.
 *
 * The proof travels with the closing event rather than with the report,
 * because it belongs to the person who went back and looked, and that is
 * rarely the person who complained.
 */
export function toBlockerReport(
  row: ReportRow,
  events: ReportEventRow[] = [],
): BlockerReport {
  const latest = events[0];
  const resolved = events.find((event) => event.kind === "resolved");
  return {
    id: row.id,
    category: row.category,
    latitude: row.latitude,
    longitude: row.longitude,
    createdAt: row.created_at,
    status: latest ? latest.kind : "open",
    reportedBy: row.created_by,
    plate: optional(row.plate),
    photos: row.photos.length ? row.photos : undefined,
    note: optional(row.note),
    address: optional(row.address),
    resolution:
      resolved && latest?.kind === "resolved"
        ? {
            photos: resolved.photos,
            at: resolved.created_at,
            by: resolved.actor,
          }
        : undefined,
  };
}

/** Report rows plus what was done about them, joined in one pass. */
export function toBlockerReports(
  rows: ReportRow[],
  events: ReportEventRow[],
): BlockerReport[] {
  const byReport = eventsByReport(events);
  return rows.map((row) => toBlockerReport(row, byReport.get(row.id) ?? []));
}

/** A new report's columns, from what `addReport` was handed. */
export function toReportInsert(
  report: BlockerReport,
  createdBy: string,
): ReportInsert {
  return {
    id: report.id,
    category: report.category,
    latitude: report.latitude,
    longitude: report.longitude,
    address: report.address ?? null,
    plate: report.plate ?? null,
    note: report.note ?? null,
    photos: report.photos ?? [],
    created_by: createdBy,
  };
}
