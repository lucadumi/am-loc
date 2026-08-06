import { Portal } from "@rn-primitives/portal";
import { X } from "lucide-react-native";
import { ReactNode, useEffect, useId, useState } from "react";
import { BackHandler, Pressable, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/ui/text";
import { palette } from "@/constants/theme";

const SPRING = { damping: 20, stiffness: 220 };

/**
 * Bottom sheet that slides up from the bottom over a fading backdrop. Mount it
 * once with `open` controlled from the parent; it animates itself in/out,
 * supports drag-to-dismiss on the grab handle, tap-outside and Android back to
 * close. Renders nothing while fully closed.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const portalName = useId();
  const [rendered, setRendered] = useState(open);
  const [sheetH, setSheetH] = useState(0);
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);

  useEffect(() => {
    if (open) setRendered(true);
  }, [open]);

  useEffect(() => {
    if (!rendered) return;
    if (open) {
      drag.value = 0;
      progress.value = withTiming(1, { duration: 260 });
    } else {
      progress.value = withTiming(0, { duration: 220 }, (finished) => {
        if (finished) runOnJS(setRendered)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rendered]);

  useEffect(() => {
    if (!rendered) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (open) {
        onClose();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [rendered, open, onClose]);

  const pan = Gesture.Pan()
    .onChange((e) => {
      drag.value = Math.max(0, drag.value + e.changeY);
    })
    .onFinalize(() => {
      if (drag.value > 90) {
        runOnJS(onClose)();
      } else {
        drag.value = withSpring(0, SPRING);
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => {
    const hidden = sheetH || height;
    return {
      transform: [{ translateY: (1 - progress.value) * hidden + drag.value }],
    };
  });

  if (!rendered) return null;

  return (
    <Portal name={portalName}>
      <View className="absolute inset-0" style={{ zIndex: 50 }}>
        <Animated.View
          style={backdropStyle}
          className="absolute inset-0 bg-black/50"
        >
          <Pressable
            className="flex-1"
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Închide"
          />
        </Animated.View>

        <Animated.View style={sheetStyle} className="absolute inset-x-0 bottom-0">
          <View
            onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}
            className="rounded-t-3xl bg-background"
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}
          >
            <GestureDetector gesture={pan}>
              <View className="items-center pb-1 pt-3">
                <View className="h-1.5 w-10 rounded-full bg-border" />
              </View>
            </GestureDetector>

            {title ? (
              <View className="flex-row items-center justify-between px-5 pb-1 pt-1">
                <Text className="font-title text-lg text-foreground">{title}</Text>
                <Pressable
                  onPress={onClose}
                  className="h-9 w-9 items-center justify-center rounded-full bg-secondary"
                  accessibilityRole="button"
                  accessibilityLabel="Închide"
                >
                  <X size={18} color={palette.foreground} />
                </Pressable>
              </View>
            ) : null}

            <View className="px-5 pt-2">{children}</View>
          </View>
        </Animated.View>
      </View>
    </Portal>
  );
}
