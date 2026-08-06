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
  accent: "#E4E4E7",
  border: "#DDDDE1",
  foreground: "#18181B",
  mutedForeground: "#71717A",
  primary: "#F5C518",
  primaryForeground: "#141416",
  free: "#34D399",
  leaving: "#FBBF24",
  taken: "#F87171",
  destructive: "#EF4444",
  /** Neutral gray scale (light → dark). */
  gray: {
    50: "#F4F4F5",
    100: "#E4E4E7",
    200: "#C9C9CF",
    300: "#A9A9B2",
    400: "#7D7D8C",
    500: "#60606C",
    600: "#484851",
    700: "#37373E",
    800: "#29292E",
    900: "#1D1D20",
    950: "#161618",
  },
  /** Brand yellow scale (500 is the primary #F5C518). */
  yellow: {
    50: "#FEFAE6",
    100: "#FDF0B9",
    200: "#FBE488",
    300: "#F9D658",
    400: "#F6CC31",
    500: "#F5C518",
    600: "#E1A809",
    700: "#B87E0A",
    800: "#8D590C",
    900: "#603B10",
    950: "#2C2211",
  },
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

/**
 * What a kerb's regime is called, in the driver's words.
 *
 * `unknown` is spelled out rather than left blank. A blank reads as "nothing to
 * worry about", which is the one meaning it must not have: the app does not
 * know, and saying so is the whole reason lib/kerbs.ts exists.
 */

/**
 * Colour by whether the driver may park, not by how the kerb is administered.
 *
 * Paid and residents-only share a colour because they answer the same question
 * the same way -- you may leave the car, subject to something -- and giving them
 * separate hues would spend the map's whole palette on a distinction the driver
 * makes once, at the sign. Unknown goes grey for the same reason uncertain spots
 * do in `confidenceColor`: a washed-out green still reads as permission.
 */

/**
 * What is in the way, as a noun phrase that can be dropped into a sentence.
 *
 * Lowercase and undetermined on purpose: these are consumed as "Aici e trecere
 * de pietoni", so they have to read as the middle of a line rather than the
 * start of one. Naming the obstruction is the difference between a warning a
 * driver can check against what they can see and one they can only obey.
 */

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
