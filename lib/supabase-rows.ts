/**
 * Turning database rows into the shapes the app already speaks.
 *
 * Everything here is pure and imports nothing at runtime, which is the point:
 * the mapping is the part most likely to be wrong, and it is the part that
 * would otherwise need a live Postgres to test. Kept apart from
 * `lib/supabase.ts`, it can be checked with plain objects and no network, no
 * device and no credentials.
 *
 * Note what is absent: a status. `spots` has no such column and the app no
 * longer derives one for a public place -- see `SpotStatus` in @/types.
 */

import type { AvailabilityWindow, BlockerReport, ParkingSpot } from "@/types";
import type {
  AvailabilityWindowInsert,
  AvailabilityWindowRow,
  ReportEventRow,
  ReportInsert,
  ReportRow,
  SpotRow,
} from "@/types/database.ts";

/** Postgres says `null`; the app's optional fields say `undefined`. */
const optional = <T>(value: T | null): T | undefined =>
  value === null ? undefined : value;

/**
 * A spot row, as the `ParkingSpot` the screens read.
 *
 * A straight rename of columns, and that is the whole of it now. It used to
 * flatten the newest claim about the kerb onto the spot and invent a `taken`
 * for the ones nobody had claimed anything about, which put a made-up status on
 * 838 of the 851 imported car parks. There is no status here at all any more:
 * where the place is, how big it is, what it charges. A private spot gets one
 * from its owner's windows, in `applyDeclaration`.
 */
export function toParkingSpot(row: SpotRow): ParkingSpot {
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
    ownerId: optional(row.owner_id),
    ownerName: optional(row.owner_name),
    totalCount: optional(row.total_count),
    pricePerHour: optional(row.price_per_hour),
    /* Carried rather than derived from `price_per_hour`. A car park that
       charges an unpublished tariff is `paid: true` with no price, and reading
       the missing price as free is what `priceRank` exists to avoid. */
    paid: optional(row.paid),
    rating: optional(row.rating),
    imageUrl: optional(row.image_url),
  };
}

/** A page of spot rows. */
export function toParkingSpots(rows: SpotRow[]): ParkingSpot[] {
  return rows.map(toParkingSpot);
}


/** An availability window as its row. */
function toAvailabilityWindow(
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
    photoCount: row.photo_count,
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
