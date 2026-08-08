/**
 * The rows as Postgres actually returns them.
 *
 * Hand-written rather than generated, so that these and the schema can be
 * diffed by eye in a review. Two conventions are worth stating because they are
 * the source of most mapping bugs:
 *
 *   - Columns are `snake_case` here and `camelCase` in `@/types`. Nothing
 *     outside `lib/supabase-rows.ts` should ever see the snake_case shape.
 *   - A nullable column is `T | null`, never `T | undefined`. Postgres has one
 *     idea of absence and TypeScript has two; collapsing them at the boundary
 *     is what keeps `null` from leaking into props that expect `undefined`.
 */

import type {
  ReportCategory,
  SpotAccess,
  SpotKind,
  SpotSource,
  SpotStatus,
} from "./index.ts";

/** A row of `spots`. Note what is absent: status lives in `status_reports`. */
export interface SpotRow {
  id: string;
  title: string;
  kind: SpotKind;
  /** Who may speak for this spot. A row that does not say is a public kerb. */
  access: SpotAccess | null;
  source: SpotSource | null;
  /** The one account allowed to open and close this spot's windows. */
  owner_id: string | null;
  owner_name: string | null;
  area: string | null;
  latitude: number;
  longitude: number;
  price_per_hour: number | null;
  /**
   * Whether the place charges at all, which is not the same question as how
   * much. Three states, so `null` means nobody has said rather than free.
   */
  paid: boolean | null;
  total_count: number | null;
  rating: number | null;
  image_url: string | null;
  created_by: string | null;
  created_at: string;
}

/**
 * A row of `availability_windows`: a stretch of time an owner is offering.
 *
 * Note what is absent, and why. No reporter, because an owner is not one. No
 * confidence, because there is nothing to be unsure about. And unlike
 * `status_reports` this table is not append-only: an owner changing their plans
 * edits the offer rather than filing a correction that argues with their
 * earlier self.
 */
export interface AvailabilityWindowRow {
  id: string;
  spot_id: string;
  /** Minutes from local midnight in Bucharest. */
  from_minute: number;
  to_minute: number;
  /** Weekdays, 0 = Sunday. Null means every day. */
  days: number[] | null;
  starts_on: string | null;
  ends_on: string | null;
  price_per_hour: number | null;
  note: string | null;
  /** Denormalised from `spots` so row level security can check it directly. */
  owner_id: string;
  created_at: string;
}

/** A row of `status_reports`: one driver's claim about one spot. */
export interface StatusReportRow {
  id: number;
  spot_id: string;
  status: SpotStatus;
  leaving_in_min: number | null;
  /** Free spaces counted by the driver as they left. Null where not asked. */
  spaces: number | null;
  reporter_id: string;
  created_at: string;
}

/** Columns of `availability_windows` a client is allowed to write. */
export type AvailabilityWindowInsert = Omit<AvailabilityWindowRow, "created_at">;

/** Columns of `status_reports` a client is allowed to write. */
export type StatusReportInsert = Pick<
  StatusReportRow,
  "spot_id" | "status" | "reporter_id"
> & { leaving_in_min?: number | null; spaces?: number | null };

/**
 * A row of `reports`. Note what is absent, again: where a report got to lives
 * in `report_events`, because it is a history rather than a property.
 */
export interface ReportRow {
  id: string;
  category: ReportCategory;
  latitude: number;
  longitude: number;
  address: string | null;
  /**
   * Null for anybody but the author.
   *
   * The app reads reports through `reports_readable`, which masks this column
   * per row; the column itself is revoked on the table. So a null here means
   * either that no plate was given or that it is not yours to see, and the two
   * are deliberately indistinguishable to the client.
   */
  plate: string | null;
  note: string | null;
  photos: string[];
  created_by: string;
  created_at: string;
}

/** A row of `report_events`: something somebody did about a report. */
export interface ReportEventRow {
  id: number;
  report_id: string;
  kind: "forwarded" | "resolved";
  photos: string[];
  actor: string;
  created_at: string;
}

/** Columns of `reports` a client is allowed to write. */
export type ReportInsert = Omit<ReportRow, "created_at">;

/**
 * Columns of `reports` an author may change afterwards.
 *
 * Deliberately not `Partial<ReportInsert>`: the place, the moment and the
 * author are refused by a trigger on the table, and a type that lets them be
 * typed here would only postpone the error to the network.
 */
export type ReportUpdate = Partial<
  Pick<ReportRow, "category" | "plate" | "note" | "photos">
>;
