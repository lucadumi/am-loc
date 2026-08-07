import { SpotStatus } from "@/types";

import type { ConfidenceLevel } from "@/lib/spot-state";

/**
 * Raw hex tokens mirroring the CSS variables in global.css. Use NativeWind
 * classNames (bg-primary, text-foreground, …) in JSX; reach for these only
 * where a real color string is required: react-native-maps markers, status
 * bar, icon `color` props and reanimated interpolations.
 */
export const palette = {
  background: "#ECECEE",
  card: "#FFFFFF",
  secondary: "#E4E4E7",
  border: "#DDDDE1",
  foreground: "#18181B",
  mutedForeground: "#71717A",
  primary: "#F5C518",
  primaryForeground: "#141416",
  free: "#34D399",
  leaving: "#FBBF24",
  taken: "#F87171",
  destructive: "#EF4444",
  /**
   * Coral, for the map pin that marks where a spot is.
   *
   * Deliberately not one of the three status colours above, and not the
   * destructive red either: a pin says *where*, never *how it is going*, and
   * borrowing `taken` would have every card's location marker read as a
   * warning that the place is full.
   */
  coral: "#FF6B5A",
  /** Cool indigo accent, complement of the brand yellow. */
  indigo: {
    50: "#EEF2FF",
    100: "#E0E7FF",
    200: "#C7D2FE",
    300: "#A5B4FC",
    400: "#818CF8",
    500: "#6366F1",
    600: "#4F46E5",
    700: "#4338CA",
    800: "#3730A3",
    900: "#312E81",
    950: "#1E1B4B",
  },
} as const;

export const statusColor: Record<SpotStatus, string> = {
  free: palette.free,
  leaving: palette.leaving,
  taken: palette.taken,
};

export const statusLabel: Record<SpotStatus, string> = {
  free: "Liber",
  leaving: "Pleacă acum",
  taken: "Ocupat",
};

/**
 * How sure the app is about a spot, in the same shape as `statusLabel`.
 *
 * A status says what someone claimed; these say how much to believe it. They
 * are deliberately separate: "Liber" and "acum 20 de minute" are different
 * facts, and collapsing them is what sends a driver to a spot that went hours
 * ago. See lib/spot-state.ts for where the levels come from.
 */
export const confidenceLabel: Record<ConfidenceLevel, string> = {
  none: "Fără raportări",
  fresh: "Chiar acum",
  recent: "Recent",
  aging: "De ceva timp",
  stale: "Învechit",
  disputed: "Contestat",
  /* Not a degree of certainty but a different kind of fact: the person who
     decides has said so. Worded to work whether the answer is free or taken,
     because the owner is equally authoritative about both. */
  declared: "Spus de proprietar",
};

/**
 * Colour by how much to believe it, not by what was claimed.
 *
 * Anything uncertain goes grey rather than keeping the status colour at lower
 * opacity: a washed-out green still reads as "free" at a glance, which is the
 * misreading worth designing against. Disputed is the one exception, and it
 * borrows the warning colour because it needs to be noticed rather than
 * ignored.
 */
export const confidenceColor: Record<ConfidenceLevel, string> = {
  none: palette.mutedForeground,
  fresh: palette.free,
  recent: palette.free,
  aging: palette.leaving,
  stale: palette.mutedForeground,
  disputed: palette.leaving,
  /* Indigo rather than green: it reads as official rather than as good news,
     which matters because this label also appears on a spot the owner has said
     is *taken*, and a green badge there would be a small lie. Same accent the
     paid kerb regime uses, for the same reason. */
  declared: palette.indigo[600],
};
