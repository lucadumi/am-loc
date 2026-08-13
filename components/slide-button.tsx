import { ChevronsRight } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, LayoutChangeEvent, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useColors } from "@/hooks/use-theme";
import { useScreenReader } from "@/hooks/use-accessibility";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";

// Track height and knob diameter share one explicit value, so the knob is a
// perfect circle with the pill's exact corner radius: no gap, no clipping.
const HEIGHT = 64;
const KNOB = HEIGHT;
const PAD = 0;

/**
 * "Slide to confirm": drag the yellow knob across the track; releasing past
 * ~80% fires `onComplete`.
 *
 * The drag is the point rather than the decoration. Filing a blocker report
 * names somebody's vehicle and sends a complaint to a sector hall, and a
 * button that does that on one tap is a button that does it from a pocket.
 *
 * WHICH MAKES IT THE ONE CONTROL IN THE APP THAT CANNOT BE MADE ACCESSIBLE BY
 * LABELLING IT. With VoiceOver or TalkBack running, a swipe is taken by the
 * reader to move its own cursor -- it never reaches a pan handler, and no set
 * of accessibility props changes that. So this draws a different control
 * instead: a plain button that asks for confirmation. The deliberateness that
 * the drag buys is preserved by the second step rather than by the gesture,
 * which is the honest trade -- the alternative is a driver who cannot file a
 * report at all.
 *
 * `Alert` rather than a custom sheet on purpose: the platform dialog is
 * already focused, announced and dismissible by a screen reader, and a
 * hand-built confirmation is one more thing to get those three wrong.
 */
export function SlideButton({
  label,
  onComplete,
  disabled = false,
  className,
  /** What the confirmation asks. Defaults to the label, which is a sentence. */
  confirmLabel,
}: {
  label: string;
  onComplete: () => void;
  disabled?: boolean;
  className?: string;
  confirmLabel?: string;
}) {
  const colors = useColors();
  const screenReader = useScreenReader();
  const [trackW, setTrackW] = useState(0);
  const x = useSharedValue(0);
  const done = useSharedValue(false);
  const maxX = Math.max(1, trackW - KNOB - PAD * 2);

  /* The gesture is memoized on layout and `disabled`, so anything it closed
     over is frozen from the render that built it, and neither dependency
     changes while a form is being filled in. Calling `onComplete` directly
     would therefore publish the screen as it was the instant the button first
     laid out: the street name three characters in, the pin still on its
     default, the interval never chosen. The ref is read at the moment the
     slide completes, which is the only moment its value matters. */
  const latest = useRef(onComplete);
  useEffect(() => {
    latest.current = onComplete;
  });

  const finish = () => {
    haptics.success();
    latest.current();
  };

  /* A rejected submit re-enables the button with the knob still parked at the
     far end, so it springs back to the start to say the answer did not take.
     This only reaches callers that toggle `disabled`; `onBegin` below is what
     makes the control recoverable for the ones that do not. */
  useEffect(() => {
    if (disabled) return;
    done.value = false;
    x.value = withSpring(0);
  }, [disabled, done, x]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!disabled)
        /* A completed slide leaves the knob at the far end, which is past the
           threshold, so the next touch and release would fire again having
           slid nothing. Latching on `done` stops that, and clearing it here is
           what stops the latch being permanent: a caller that never toggles
           `disabled` (the blocker report, the garage) would otherwise be left
           with a dead button after its first slide. Starting a new gesture
           returns the knob to the beginning, so firing again costs a
           deliberate slide rather than a tap. */
        .onBegin(() => {
          if (!done.value) return;
          done.value = false;
          x.value = 0;
        })
        .onChange((e) => {
          if (done.value) return;
          x.value = Math.min(maxX, Math.max(0, x.value + e.changeX));
        })
        .onEnd(() => {
          if (done.value) return;
          if (x.value > maxX * 0.8) {
            x.value = withTiming(maxX, { duration: 120 });
            done.value = true;
            runOnJS(finish)();
          } else {
            x.value = withSpring(0);
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maxX, disabled],
  );

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));
  const fillStyle = useAnimatedStyle(() => ({
    width: x.value + KNOB + PAD * 2,
  }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, maxX * 0.6], [1, 0]),
  }));

  /* The whole control, replaced rather than annotated -- and after every hook,
     because the rules of hooks do not bend for a good reason. The gesture and
     the animated styles above are built either way and go unused here, which
     costs a few objects and keeps this one component rather than two that
     share a name and have to be kept in step. */
  if (screenReader) {
    return (
      <Button
        className={className}
        label={label}
        disabled={disabled}
        accessibilityHint="Se cere o confirmare înainte de trimitere"
        onPress={() =>
          Alert.alert(confirmLabel ?? label, undefined, [
            { text: "Renunț", style: "cancel" },
            { text: "Confirmă", onPress: finish },
          ])
        }
      />
    );
  }

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setTrackW(e.nativeEvent.layout.width)}
      style={{ height: HEIGHT }}
      className={cn(
        "justify-center rounded-full bg-secondary",
        disabled && "opacity-60",
        className,
      )}
    >
      <Animated.View
        style={fillStyle}
        className="absolute left-0 top-0 h-full rounded-full bg-primary/25"
      />
      <Animated.View
        style={labelStyle}
        pointerEvents="none"
        className="absolute w-full items-center"
      >
        <Text className="font-semi text-muted-foreground">{label}</Text>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[knobStyle, { width: KNOB, height: KNOB, marginLeft: PAD }]}
          className="items-center justify-center rounded-full bg-primary"
        >
          <ChevronsRight
            size={26}
            color={colors.primaryForeground}
            strokeWidth={2.5}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
