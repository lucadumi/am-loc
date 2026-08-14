/* `import type`, not a plain import: `@/types` is types only, so a value
   import of it survives Node's type stripping and asks at runtime for an
   export that does not exist. That is the difference between this file being
   loadable outside the bundler -- by a test that checks the palette's contrast
   ratios, for instance -- and not. The same note is on lib/api.ts, which hit
   it first. */
import type { SpotStatus } from "@/types";

/**
 * Raw hex tokens mirroring the CSS variables in global.css.
 *
 * Use NativeWind classNames (`bg-primary`, `text-foreground`, …) in JSX and
 * reach for these only where a real colour string is required:
 * react-native-maps markers, the status bar, icon `color` props and reanimated
 * interpolations. Those are the places a class cannot go, and they are why the
 * same decision is written twice -- here and in `global.css`.
 *
 * DO NOT IMPORT THIS DIRECTLY FROM A COMPONENT. `useColors()` in
 * hooks/use-theme.ts returns whichever of the two themes is showing; a direct
 * import is a colour that stays light when the phone goes dark, and it fails
 * silently -- charcoal text on a charcoal card is not an exception, it is an
 * invisible screen.
 */
/**
 * The tokens a theme has to answer for.
 *
 * Named rather than inferred from one of them with `typeof`, because `as
 * const` would make each value its own literal type and the second theme could
 * then hold nothing but the first theme's exact colours. Stating the shape is
 * also what makes adding a token an error in both places at once, which is the
 * only way two palettes stay the same size.
 */
export interface Palette {
  background: string;
  card: string;
  secondary: string;
  border: string;
  foreground: string;
  mutedForeground: string;
  primary: string;
  primaryForeground: string;
  /** The brand yellow at zero alpha, for interpolating to transparent. */
  primaryTransparent: string;
  free: string;
  leaving: string;
  taken: string;
  destructive: string;
  coral: string;
  /**
   * The accent, as three tokens rather than a step on a ramp.
   *
   * `accent` is the icon or text; `accentSurface` is the tinted pill it sits
   * on; `accentSolid` is the saturated fill that carries light text. Which
   * step of the indigo scale each one is differs by theme -- indigo-700 reads
   * on white and disappears on charcoal -- and a caller that reached for a
   * step by number would have to know that. These do not.
   */
  accent: string;
  accentSurface: string;
  accentSolid: string;
  indigo: Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950, string>;
}

export const lightPalette: Palette = {
  background: "#ECECEE",
  card: "#FFFFFF",
  secondary: "#E4E4E7",
  border: "#DDDDE1",
  foreground: "#18181B",
  /**
   * Secondary text: areas, walk times, hints, every explanatory line.
   *
   * Darkened from `#71717A`, which read as 3.81:1 on the `secondary` surface
   * and 4.10 on the canvas -- both under the 4.5 that body text needs, and
   * this is the most-used colour in the app after the foreground. It looked
   * fine, which is the whole problem with checking contrast by eye: "recedes"
   * and "cannot be read in sunlight" are a few percent apart.
   *
   * Not darkened further than it has to be. At zinc-600 it stops receding at
   * all and the hierarchy the colour exists for goes with it.
   */
  mutedForeground: "#5F5F68",
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
  /**
   * Withdrawing, deleting, and the banner that says a report failed to send.
   *
   * Darkened from `#EF4444` for the same reason as the muted grey: as *text*
   * it was 2.97:1 on the secondary surface, well under the threshold, and it
   * is text in both places it matters -- "Ieși din cont" and the failure
   * banner on the report screen.
   *
   * It improves the one place it is a fill rather than text. The report
   * marker is a white icon on this colour, which was 3.76:1 and is now 6.47.
   */
  destructive: "#B91C1C",
  /**
   * Coral, for the map pin that marks where a spot is.
   *
   * Deliberately not one of the three status colours above, and not the
   * destructive red either: a pin says *where*, never *how it is going*, and
   * borrowing `taken` would have every card's location marker read as a
   * warning that the place is full.
   */
  coral: "#FF6B5A",

  accent: "#4338CA",
  accentSurface: "#E0E7FF",
  accentSolid: "#4F46E5",

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

/* Only ever drawn on a private spot: a public one has no status to colour --
   see `SpotStatus` in @/types. */


/**
 * The same tokens, for a phone that has asked for a dark interface.
 *
 * NOT THE LIGHT THEME INVERTED, and the two accents are why. `destructive` was
 * darkened to `#B91C1C` so it would clear 4.5:1 as text on white; on the dark
 * card that same red is 2.2:1, which is less readable than the colour it
 * replaced. `indigo[600]` has the same problem at 2.7:1. A dark theme built by
 * flipping the greys and keeping the accents is one where every warning and
 * every accent is unreadable, and it is the commonest way this is got wrong.
 *
 * The greys are warm-neutral rather than pure black. Pure black against a
 * bright accent is the highest contrast available and is not the most
 * readable: on an OLED screen it smears when scrolled, and the surfaces stop
 * being distinguishable from each other -- a card at #000 on a canvas at #000
 * is a card nobody can see the edge of.
 *
 * Every pair here is held to the same thresholds as the light theme by
 * `__tests__/contrast.test.ts`, which runs over both.
 */
export const darkPalette: Palette = {
  background: "#131316",
  card: "#1C1C20",
  secondary: "#2A2A30",
  border: "#33333A",
  foreground: "#F4F4F5",
  mutedForeground: "#A1A1AA",

  /* The brand yellow is unchanged, and is the reason the app still looks like
     itself in the dark. It carries near-black text on both themes because it
     is a light colour on either. */
  primary: "#F5C518",
  primaryForeground: "#141416",
  primaryTransparent: "rgba(245,197,24,0)",

  /* Lifted, not reused. See the note above: the light theme's reds and indigos
     are chosen to be dark enough for white, which makes them too dark for
     anything else. */
  free: "#34D399",
  leaving: "#FBBF24",
  taken: "#F87171",
  destructive: "#F87171",
  coral: "#FF8B7A",

  /* Three steps lighter than the light theme's, which is the whole point: the
     accent has to read against a charcoal card, and indigo-700 there is
     2.7:1. The solid fill is unchanged -- white text on it is 6.3:1 either
     way, because a saturated fill is its own background. */
  accent: "#A5B4FC",
  accentSurface: "#1E1B4B",
  accentSolid: "#4F46E5",

  /* The same literal scale as the light theme, deliberately. Inverting it was
     the first attempt and was wrong twice over: the number stops meaning
     brightness, so `indigo[600]` is dark on one theme and light on the other;
     and the `bg-indigo-*` classes come from Tailwind's own static scale, which
     does not invert -- so a pale pill kept its colour while the icon on it
     flipped to pale, and the two washed each other out.
     
     What varies by theme is which *step* is the accent, and that is what the
     three tokens above are for. */
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

/** Which of the two a screen is drawn in. */
export type ThemeName = "light" | "dark";

export const themes: Record<ThemeName, Palette> = {
  light: lightPalette,
  dark: darkPalette,
};

/**
 * The colour a spot's status is drawn in, for whichever theme is showing.
 *
 * A function rather than the constant map it used to be: the map held
 * `palette.free` at module load, which is exactly the shape that cannot follow
 * a theme. Only ever drawn on a private spot -- a public one has no status to
 * colour, see `SpotStatus` in @/types.
 */
export function statusColors(colors: Palette): Record<SpotStatus, string> {
  return { free: colors.free, taken: colors.taken };
}

export const statusLabel: Record<SpotStatus, string> = {
  free: "Liber",
  taken: "Ocupat",
};

