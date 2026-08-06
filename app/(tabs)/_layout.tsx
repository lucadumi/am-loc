import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { House, Map as MapIcon, Plus, TriangleAlert, User } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { palette } from "@/constants/theme";
import { haptics } from "@/lib/haptics";

const ICONS: Record<string, typeof House> = {
  index: House,
  map: MapIcon,
  add: Plus,
  reports: TriangleAlert,
  profile: User,
};

const LABELS: Record<string, string> = {
  index: "Acasă",
  map: "Hartă",
  add: "Adaugă",
  reports: "Sesizări",
  profile: "Profil",
};

// Longer + eased so the highlight cross-fades: it fades out on the tab you
// leave exactly as it fades in on the one you press (shared timing = in sync).
const DURATION = 360;
const EASING = Easing.inOut(Easing.cubic);
// Transparent yellow, so the highlight fades straight to primary (no grey mid).
const PRIMARY_TRANSPARENT = "rgba(245,197,24,0)";

/**
 * One icon-only tab. A single `progress` shared value (0 inactive → 1 active)
 * drives both the yellow highlight (background) and the icon colour cross-fade
 * on the UI thread. No label, just the highlight.
 */
function TabItem({
  focused,
  Icon,
  label,
  onPress,
}: {
  focused: boolean;
  Icon: typeof House;
  label: string;
  onPress: () => void;
}) {
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(focused ? 1 : 0, {
      duration: DURATION,
      easing: EASING,
    });
  }, [focused, progress]);

  const highlightStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [PRIMARY_TRANSPARENT, palette.primary],
    ),
  }));
  const iconInactive = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const iconActive = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
    >
      <Animated.View
        style={highlightStyle}
        className="h-12 w-12 items-center justify-center rounded-full"
      >
        <View className="h-6 w-6 items-center justify-center">
          <Animated.View style={iconInactive}>
            <Icon size={22} color={palette.mutedForeground} strokeWidth={2.2} />
          </Animated.View>
          <Animated.View
            style={iconActive}
            className="absolute inset-0 items-center justify-center"
          >
            <Icon size={22} color={palette.primaryForeground} strokeWidth={2.2} />
          </Animated.View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Center "+" action. A distinct indigo button that adopts the same yellow
 * active-highlight as the other tabs when the Contribuie screen is focused,
 * cross-fading the fill and icon colour on the UI thread. Scales on press.
 */
function AddButton({
  focused,
  label,
  onPress,
}: {
  focused: boolean;
  label: string;
  onPress: () => void;
}) {
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(focused ? 1 : 0, {
      duration: DURATION,
      easing: EASING,
    });
  }, [focused, progress]);

  const fillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [palette.indigo[600], palette.primary],
    ),
  }));
  const plusIndigo = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const plusYellow = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
    >
      {({ pressed }) => (
        <Animated.View
          style={[fillStyle, { transform: [{ scale: pressed ? 0.92 : 1 }] }]}
          className="h-14 w-14 items-center justify-center rounded-full"
        >
          <View className="h-7 w-7 items-center justify-center">
            <Animated.View style={plusIndigo}>
              <Plus size={28} color={palette.card} strokeWidth={2.6} />
            </Animated.View>
            <Animated.View
              style={plusYellow}
              className="absolute inset-0 items-center justify-center"
            >
              <Plus size={28} color={palette.primaryForeground} strokeWidth={2.6} />
            </Animated.View>
          </View>
        </Animated.View>
      )}
    </Pressable>
  );
}

/**
 * Bottom navigation: a white floating pill (hairline border) over the page.
 * The active tab shows a yellow highlight behind its icon; the rest are muted
 * icons. The center "+" is always a larger, distinct charcoal button.
 */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 bottom-0 items-center px-4 pt-3"
      style={{ paddingBottom: Math.max(insets.bottom, 16) }}
    >
      <View
        className="flex-row items-center gap-2 rounded-full border-hairline border-border bg-card px-2.5 py-1.5"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 5 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
          elevation: 6,
        }}
      >
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const Icon = ICONS[route.name] ?? House;
          const label = LABELS[route.name] ?? route.name;

          const onPress = () => {
            haptics.selection();
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          // Center action: a distinct indigo "+" that turns yellow when active.
          if (route.name === "add") {
            return (
              <AddButton
                key={route.key}
                focused={focused}
                label={label}
                onPress={onPress}
              />
            );
          }

          return (
            <TabItem
              key={route.key}
              focused={focused}
              Icon={Icon}
              label={label}
              onPress={onPress}
            />
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="map" />
      <Tabs.Screen name="add" />
      <Tabs.Screen name="reports" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
