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
  /**
   * The brand yellow at zero alpha.
   *
   * Written out rather than derived because there is no hex-to-rgba helper
   * here, and kept beside `primary` so the two cannot drift: the tab bar
   * cross-fades between them, and an interpolation that ends at a *different*
   * yellow's transparent passes through colours nobody chose on the way.
   */
  primaryTransparent: "rgba(245,197,24,0)",
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

/**
 * The dark washes drawn over photographs and maps.
 *
 * Named because they were not. The same idea was written by hand as
 * `rgba(20,20,22,0.22)` on the home banner and the detail hero, and as
 * `rgba(20,20,22,0.7)` on a photo thumbnail's delete button -- three times the
 * strength, in a codebase where nobody had decided that. A scrim exists to buy
 * contrast for what sits on top of it, so the levels are named after what they
 * are for rather than after their opacity.
 */
export const scrim = {
  /** Enough to hold white text over an image without hiding the image. */
  overlay: "rgba(20,20,22,0.22)",
  /** Transparent end of a gradient that starts at `overlay`. */
  overlayEnd: "rgba(20,20,22,0)",
  /** Strong, for a small control that has to read against anything at all. */
  control: "rgba(20,20,22,0.7)",
} as const;

/**
 * The two shadows this app uses.
 *
 * Written out four times before this, at 0.06, 0.08 and 0.25, which is three
 * decisions where there are only two things being said: a card lifted off the
 * canvas, and a marker lifted off a map. Spread as `...shadow.card` into a
 * style object; `elevation` is Android's separate spelling of the same idea and
 * has to travel with the rest.
 */
export const shadow = {
  /** A surface resting on the background: floating controls, the tab bar. */
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  /** A pin standing on a map, which needs to look like it is above the ground. */
  marker: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
  },
  /**
   * The tab bar, which floats over everything including the map.
   *
   * Kept apart from `card` rather than rounded into it. The difference reads
   * as barely anything on iOS (0.08 against 0.06) and as a great deal on
   * Android, where `elevation` is the whole effect: at the card's 3 the bar
   * sits *in* the map instead of over it.
   */
  raised: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
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
