/**
 * Which theme is showing, and the colours that go with it.
 *
 * The app is drawn two ways and the split runs down the middle of how a colour
 * is expressed. Anything in a `className` -- `bg-card`, `text-foreground` --
 * is handled by NativeWind: `.dark` in `global.css` swaps the variable and the
 * class never changes. This hook is for everything a class cannot reach, which
 * is a longer list than it sounds: an icon's `color` prop, a map marker's
 * fill, the status bar, a reanimated interpolation between two colours.
 *
 * WHY A HOOK RATHER THAN AN IMPORT, given that a palette is a constant. Because
 * `import { palette }` is evaluated once, at module load, and the answer it
 * gives is the theme the app happened to start in. A driver who turns their
 * phone dark at dusk would keep every icon, pin and marker in the light theme's
 * colours until the app was killed -- charcoal on charcoal, which is not a
 * degraded screen but an empty one.
 *
 * `useColorScheme` comes from NativeWind rather than from React Native so that
 * the two cannot disagree: it is the same signal driving the `.dark` class, so
 * a colour from here and a class beside it always describe the same theme.
 */

import { useColorScheme } from "nativewind";

import {
  statusColors,
  themes,
  type ThemeName,
  type lightPalette,
} from "@/constants/theme";
import type { SpotStatus } from "@/types";

/** The palette for whichever theme is showing. */
export function useColors(): typeof lightPalette {
  return themes[useTheme()];
}

/**
 * The name of the theme showing.
 *
 * For the handful of places that need the word rather than the colours: the
 * status bar's own light/dark setting, and `MapView`'s `userInterfaceStyle`,
 * which takes a theme rather than a fill.
 *
 * Defaults to light when the platform has no answer, which is what the app
 * looked like before there were two of them.
 */
export function useTheme(): ThemeName {
  const { colorScheme } = useColorScheme();
  return colorScheme === "dark" ? "dark" : "light";
}

/** The colour a private spot's status is drawn in, on this theme. */
export function useStatusColors(): Record<SpotStatus, string> {
  return statusColors(useColors());
}
