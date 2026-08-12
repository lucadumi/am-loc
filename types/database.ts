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
  AccountRole,
  ReportCategory,
  SpotAccess,
  SpotKind,
  SpotSource,
  SpotStatus,
} from "./index.ts";

/**
 * A row of `profiles`: what a person says about themselves.
 *
 * Public, and trusted by nobody. Note what is absent and where it lives
 * instead: the email, the phone and the second-factor enrolment are in
 * `auth.users`, which the API does not expose at all. A column added here is a
 * decision to publish it.
 */
export interface ProfileRow {
  id: string;
  display_name: string | null;
  is_trader: boolean;
  /** Stamped by a trigger when the answer changes, never sent by a client. */
  trader_declared_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * What a person may change about themselves.
 *
 * Deliberately not `Partial<ProfileRow>`: the id, the dates and the trader
 * stamp are refused or overwritten by the trigger on the table, and a type
 * that let them be typed here would only postpone the error to the network.
 */
export type ProfileUpdate = Partial<
  Pick<ProfileRow, "display_name" | "is_trader">
>;

/**
 * A row of `user_roles`: what the project says about a person.
 *
 * Read-only from any client, and not by politeness -- `insert`, `update` and
 * `delete` are revoked from `anon` and `authenticated` on the table itself, so
 * there is no `UserRoleInsert` to write. See `0008_accounts_and_roles.sql`.
 */
export interface UserRoleRow {
  user_id: string;
  role: AccountRole;
  granted_by: string | null;
  granted_at: string;
  note: string | null;
}

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
  /**
   * Storage paths in the private `report-photos` bucket, never URLs.
   *
   * Empty for anybody but the author, by the same mechanism as the plate: the
   * view returns `'{}'` to a stranger. So an empty array here means either
   * that the report has no pictures or that they are not yours, and the two
   * are deliberately indistinguishable -- `photo_count` is the number that
   * tells them apart, because how much evidence exists is public and the
   * evidence is not.
   */
  photos: string[];
  /** How many photographs the report carries, whoever is asking. */
  photo_count: number;
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

/**
 * Columns of `reports` a client is allowed to write.
 *
 * `photo_count` is absent because it is not a column: the view derives it from
 * the array, so there is nothing to send and nothing a client could disagree
 * with it about.
 */
export type ReportInsert = Omit<ReportRow, "created_at" | "photo_count">;

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
