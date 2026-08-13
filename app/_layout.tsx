import "@/global.css";

import {
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/montserrat";
import { PortalHost } from "@rn-primitives/portal";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { Text, TextInput } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { fonts } from "@/constants/fonts";
import { useColors, useTheme } from "@/hooks/use-theme";
import { useThemeChoice } from "@/hooks/use-theme-choice";

SplashScreen.preventAutoHideAsync();

/* The styles these had before this app touched them, captured once. Re-applied
   from a theme effect below rather than set here, and the difference matters:
   this file is evaluated at module load, when the answer to "which theme" is
   whichever one the app happened to start in. A driver switching their phone
   to dark at dusk would keep a black default on a black canvas -- raw text
   that is not missing, but invisible. */
const baseText = (Text as any).defaultProps ?? {};
const baseInput = (TextInput as any).defaultProps ?? {};

export default function RootLayout() {
  const colors = useColors();
  const theme = useTheme();
  /* Read here and nowhere else on the way in: the stored choice has to be in
     force before the first screen paints, or the app flashes the system theme
     and corrects itself -- which is exactly the flash somebody sensitive to
     brightness opened the setting to avoid. The returned value is unused; the
     hook's own effect is what applies it. */
  useThemeChoice();

  /* The safety net for any raw `<Text>` or `<TextInput>` that never got a
     className. The app's own `Text` primitive carries `text-foreground` and
     needs none of this; what this catches is the third-party child and the
     one somebody forgot, which is exactly the text nobody notices has gone
     the wrong colour.
     
     Re-applied whenever the theme changes, from the base captured at load, so
     the styles are replaced rather than stacked. */
  useEffect(() => {
    (Text as any).defaultProps = {
      ...baseText,
      style: [
        { fontFamily: fonts.regular, color: colors.foreground },
        baseText.style,
      ],
    };
    (TextInput as any).defaultProps = {
      ...baseInput,
      style: [
        { fontFamily: fonts.regular, color: colors.foreground },
        baseInput.style,
      ],
    };
    /* The canvas behind everything the app draws: visible for a moment during
       a navigation transition, and as overscroll on Android. */
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors]);
  const [loaded, error] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* The clock and the battery, in whichever colour reads against what
            is behind them. `dark` means dark glyphs, which is right on the
            light theme's canvas and invisible on the dark one's. */}
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            /* A slide rather than the platform default, so opening a spot from
               a list reads as going *into* it. The maps on either side are
               centred on the same place, so the movement is the only thing that
               changes. */
            animation: "slide_from_right",
            animationDuration: 260,
            gestureEnabled: true,
          }}
        >
          <Stack.Screen name="(tabs)" />
        </Stack>
        <PortalHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
