import { useEffect, useMemo, useState } from "react";
import { LayoutChangeEvent, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { Text } from "@/components/ui/text";
import { haptics } from "@/lib/haptics";
import { ADJUST_ACTIONS, spokenPriceRange, stepValue } from "@/lib/slider";

const KNOB = 28;
const SPRING = { damping: 24, stiffness: 220, overshootClamping: true };

const KNOB_SIZE = { width: KNOB, height: KNOB } as const;

/** The yellow knob's double-line grip, matching IntervalSlider. */
function Grip() {
  return (
    <View className="flex-row gap-[3px]">
      <View className="h-3 w-px rounded-full bg-primary-foreground/50" />
      <View className="h-3 w-px rounded-full bg-primary-foreground/50" />
    </View>
  );
}

/**
 * Dual-knob range slider. Drag either yellow knob to pick a `[low, high]`
 * window; each snaps to `step` increments with a haptic tick and cannot cross
 * the other. External changes spring the idle knob into place without fighting
 * an active drag. Mirrors `IntervalSlider`'s single-knob mechanics.
 *
 * TWO ADJUSTABLE CONTROLS, NOT ONE. `IntervalSlider` makes its whole track the
 * accessible element because it holds a single value; this holds two, and a
 * reader's swipe can only mean one thing at a time. So each knob is its own
 * `adjustable` with its own name -- "preț minim", "preț maxim" -- and a driver
 * moves between them the way they move between any two controls.
 *
 * Each knob announces the pair rather than its own number, because a bound on
 * its own is not the answer to what a filter is doing: "minim, 5 lei" tells
 * you where one end is, "de la 5 lei până la 12 lei pe oră" tells you what you
 * have asked for.
 */
export function RangeSlider({
  low,
  high,
  onChange,
  min = 0,
  max = 20,
  step = 1,
  minLabel,
  maxLabel,
  unbounded,
  className,
}: {
  low: number;
  high: number;
  onChange: (low: number, high: number) => void;
  min?: number;
  max?: number;
  step?: number;
  minLabel?: string;
  maxLabel?: string;
  /**
   * The value at `max` that means "no upper bound", if there is one.
   *
   * The filter sheet's price range tops out at "any price" rather than at 20
   * lei, and a control that announced "up to 20 lei" there would have a driver
   * believe they had excluded the expensive half of the city.
   */
  unbounded?: number;
  className?: string;
}) {
  const [trackW, setTrackW] = useState(0);
  const usable = Math.max(1, trackW - KNOB);
  const steps = Math.max(1, Math.round((max - min) / step));

  const xLow = useSharedValue(0);
  const xHigh = useSharedValue(0);
  const lowStep = useSharedValue(Math.round((low - min) / step));
  const highStep = useSharedValue(Math.round((high - min) / step));
  const draggingLow = useSharedValue(false);
  const draggingHigh = useSharedValue(false);

  const toPos = (v: number) =>
    ((Math.min(max, Math.max(min, v)) - min) / Math.max(1, max - min)) * usable;

  // Sync idle knobs when the values change from outside or the track is
  // measured, but never override a knob that's mid-drag.
  useEffect(() => {
    if (!draggingLow.value) {
      xLow.value = withSpring(toPos(low), SPRING);
      lowStep.value = Math.round((Math.min(max, Math.max(min, low)) - min) / step);
    }
    if (!draggingHigh.value) {
      xHigh.value = withSpring(toPos(high), SPRING);
      highStep.value = Math.round((Math.min(max, Math.max(min, high)) - min) / step);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [low, high, trackW, min, max]);

  const report = (lo: number, hi: number) => {
    haptics.selection();
    onChange(lo, hi);
  };

  const panLow = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          draggingLow.value = true;
        })
        .onChange((e) => {
          let nx = xLow.value + e.changeX;
          if (nx < 0) nx = 0;
          if (nx > xHigh.value) nx = xHigh.value;
          xLow.value = nx;
          const s = Math.round((nx / usable) * steps);
          if (s !== lowStep.value) {
            lowStep.value = s;
            runOnJS(report)(
              Math.min(max, min + s * step),
              Math.min(max, min + highStep.value * step),
            );
          }
        })
        .onFinalize(() => {
          draggingLow.value = false;
          xLow.value = withSpring((lowStep.value / steps) * usable, SPRING);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [usable, steps, min, step, max],
  );

  const panHigh = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          draggingHigh.value = true;
        })
        .onChange((e) => {
          let nx = xHigh.value + e.changeX;
          if (nx > usable) nx = usable;
          if (nx < xLow.value) nx = xLow.value;
          xHigh.value = nx;
          const s = Math.round((nx / usable) * steps);
          if (s !== highStep.value) {
            highStep.value = s;
            runOnJS(report)(
              Math.min(max, min + lowStep.value * step),
              Math.min(max, min + s * step),
            );
          }
        })
        .onFinalize(() => {
          draggingHigh.value = false;
          xHigh.value = withSpring((highStep.value / steps) * usable, SPRING);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [usable, steps, min, step, max],
  );

  const lowKnobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: xLow.value }],
  }));
  const highKnobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: xHigh.value }],
  }));
  const fillStyle = useAnimatedStyle(() => ({
    left: xLow.value + KNOB / 2,
    width: Math.max(0, xHigh.value - xLow.value),
  }));

  const tickCount = steps > 12 ? 9 : steps + 1;

  /* One step of whichever end the reader is on, clamped so the two cannot
     cross -- the same rule the drag enforces, applied to the other input. */
  const nudge = (end: "low" | "high", direction: 1 | -1) => {
    haptics.selection();
    if (end === "low") {
      onChange(
        Math.min(high, stepValue(low, direction, { min, max, step })),
        high,
      );
    } else {
      onChange(low, Math.max(low, stepValue(high, direction, { min, max, step })));
    }
  };

  /* Said by both knobs. A bound on its own is not what a filter is doing. */
  const spoken = spokenPriceRange([low, high], { unbounded: unbounded ?? max });

  const adjustable = (end: "low" | "high") =>
    ({
      accessible: true,
      accessibilityRole: "adjustable" as const,
      accessibilityLabel: end === "low" ? "Preț minim" : "Preț maxim",
      accessibilityValue: {
        min,
        max,
        now: end === "low" ? low : high,
        text: spoken,
      },
      accessibilityActions: ADJUST_ACTIONS,
      onAccessibilityAction: (event: {
        nativeEvent: { actionName: string };
      }) => {
        if (event.nativeEvent.actionName === "increment") nudge(end, 1);
        if (event.nativeEvent.actionName === "decrement") nudge(end, -1);
      },
    }) as const;

  return (
    <View className={className}>
      <View
        onLayout={(e: LayoutChangeEvent) => setTrackW(e.nativeEvent.layout.width)}
        style={{ height: KNOB, justifyContent: "center" }}
      >
        {/* Base track */}
        <View className="h-2 rounded-full bg-secondary" />

        {/* Ticks */}
        <View
          pointerEvents="none"
          className="absolute inset-x-0 flex-row justify-between"
          style={{ paddingHorizontal: KNOB / 2 }}
        >
          {Array.from({ length: tickCount }).map((_, i) => (
            <View key={i} className="h-2 w-px rounded-full bg-border" />
          ))}
        </View>

        {/* Selected range fill (between the two knobs) */}
        <Animated.View
          style={fillStyle}
          pointerEvents="none"
          className="absolute h-2 rounded-full bg-primary"
        />

        {/* Low knob */}
        <GestureDetector gesture={panLow}>
          <Animated.View
            {...adjustable("low")}
            style={[lowKnobStyle, KNOB_SIZE]}
            className="absolute left-0 items-center justify-center rounded-full border-4 border-background bg-primary"
          >
            <Grip />
          </Animated.View>
        </GestureDetector>

        {/* High knob */}
        <GestureDetector gesture={panHigh}>
          <Animated.View
            {...adjustable("high")}
            style={[highKnobStyle, KNOB_SIZE]}
            className="absolute left-0 items-center justify-center rounded-full border-4 border-background bg-primary"
          >
            <Grip />
          </Animated.View>
        </GestureDetector>
      </View>

      {minLabel || maxLabel ? (
        <View className="mt-2 flex-row justify-between">
          <Text className="font-mid text-[11px] text-muted-foreground">
            {minLabel}
          </Text>
          <Text className="font-mid text-[11px] text-muted-foreground">
            {maxLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
