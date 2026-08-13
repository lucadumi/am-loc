/**
 * Which theme the driver has asked for, and remembering it.
 *
 * Three answers rather than two, and the third is the default: "system" means
 * whatever the phone is doing, which is the only setting that follows a driver
 * into a tunnel at dusk without them touching anything.
 *
 * WHY THE APP STORES A PREFERENCE AT ALL, given that the phone already has
 * one. Because the phone's setting is about the phone and the app is used in a
 * car. A driver whose handset lives in dark mode may still want the brighter
 * screen at noon behind a windscreen, and one who keeps the system light may
 * want the dark map at night without changing everything else they own. Those
 * are not the same preference and an app that only reads the system one is
 * telling them they are.
 *
 * The choice is read before the first paint and written whenever it changes.
 * A theme that flickered from light to dark a beat after launch would be worse
 * than not offering the setting: the flash is exactly what somebody sensitive
 * to brightness opened the setting to avoid.
 *
 * THIS DOES NOT WORK WITHOUT `"userInterfaceStyle": "automatic"` IN app.json,
 * and the failure is silent. `setColorScheme` goes through React Native's
 * `Appearance`, which the operating system overrides when the app declares a
 * fixed style -- so the call returns, nothing throws, and the interface does
 * not move. The app declared `"dark"` for a long time while looking light,
 * because there was no dark stylesheet for the declaration to matter to; the
 * moment there was one, the lock became the reason the setting did nothing.
 *
 * It is a native setting, so changing it needs a rebuild rather than a reload.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Moon, Smartphone, Sun, type LucideIcon } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useState } from "react";

/** What the driver asked for, which is not the same as what is showing. */
export type ThemeChoice = "system" | "light" | "dark";

const KEY = "amloc.theme.v1";

/** In the order the setting offers them. */
export const THEME_CHOICES: readonly ThemeChoice[] = [
  "system",
  "light",
  "dark",
] as const;

export const themeChoiceLabel: Record<ThemeChoice, string> = {
  system: "Sistem",
  light: "Deschis",
  dark: "Închis",
};

/**
 * What each choice looks like, in the order they are offered.
 *
 * A sun and a moon, and for "system" a phone -- the thing whose setting is
 * being followed. `SunMoon` is the tempting alternative and reads as a third
 * kind of theme rather than as "not my decision".
 *
 * The labels above still travel with these: `Segmented` announces them, so an
 * icon hides the word from the eye and from nothing else.
 */
export const themeChoiceIcon: Record<ThemeChoice, LucideIcon> = {
  system: Smartphone,
  light: Sun,
  dark: Moon,
};

/** Anything unrecognised is the default rather than a crash. */
function toChoice(stored: string | null): ThemeChoice {
  return stored === "light" || stored === "dark" ? stored : "system";
}

/**
 * The stored choice, and a way to change it.
 *
 * `null` while it is being read, so a caller can tell "not known yet" from
 * "the driver chose system" -- the setting screen draws nothing rather than
 * drawing the wrong segment selected for a frame and then correcting itself.
 */
export function useThemeChoice(): {
  choice: ThemeChoice | null;
  setChoice: (next: ThemeChoice) => void;
} {
  const { setColorScheme } = useColorScheme();
  const [choice, setStored] = useState<ThemeChoice | null>(null);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!alive) return;
        const next = toChoice(raw);
        setStored(next);
        setColorScheme(next);
      })
      /* A storage that cannot be read is a driver who has not chosen, which is
         the default anyway. Not worth a message on a screen about parking. */
      .catch(() => {
        if (alive) setStored("system");
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setChoice = useCallback(
    (next: ThemeChoice) => {
      /* Applied first, stored second. The write is a round trip to disk and
         the tap should not wait for it -- and if the write fails the driver
         still gets the theme they asked for, for this run. */
      setColorScheme(next);
      setStored(next);
      AsyncStorage.setItem(KEY, next).catch(() => {});
    },
    [setColorScheme],
  );

  return { choice, setChoice };
}
