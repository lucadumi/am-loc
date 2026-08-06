import {
  Accessibility,
  Bike,
  CarFront,
  Footprints,
  PersonStanding,
  type LucideIcon,
} from "lucide-react-native";

import { ReportCategory } from "@/types";

/**
 * UI metadata for blocker reports. Kept out of types/ (which stays JSX/icon
 * free) so both the report form and the Sesizări list share one source of
 * truth for category glyphs and status colors.
 */
export const reportCategoryIcon: Record<ReportCategory, LucideIcon> = {
  sidewalk: Footprints,
  ramp: Accessibility,
  crosswalk: PersonStanding,
  bikelane: Bike,
  doublepark: CarFront,
};

/**
 * A distinct accent per blocker category so the flow reads at a glance. Vivid
 * ~600-level hues, readable on the light canvas and separate from the brand
 * yellow. Tint them with an 8-digit alpha suffix (e.g. `color + "1F"`).
 */
export const reportCategoryColor: Record<ReportCategory, string> = {
  sidewalk: "#EA580C", // orange
  ramp: "#7C3AED", // violet
  crosswalk: "#0891B2", // cyan
  bikelane: "#059669", // emerald
  doublepark: "#E11D48", // rose
};

