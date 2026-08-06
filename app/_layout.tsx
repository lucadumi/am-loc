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
import { palette } from "@/constants/theme";

SplashScreen.preventAutoHideAsync();
SystemUI.setBackgroundColorAsync(palette.background).catch(() => {});

// Safety net: any raw <Text>/<TextInput> without a className still gets
// Montserrat + the light foreground color on the charcoal canvas.
const baseText = (Text as any).defaultProps ?? {};
(Text as any).defaultProps = {
  ...baseText,
  style: [{ fontFamily: fonts.regular, color: palette.foreground }, baseText.style],
};
const baseInput = (TextInput as any).defaultProps ?? {};
(TextInput as any).defaultProps = {
  ...baseInput,
  style: [{ fontFamily: fonts.regular, color: palette.foreground }, baseInput.style],
};

export default function RootLayout() {
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
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: palette.background },
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
