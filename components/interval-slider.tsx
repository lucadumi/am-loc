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
import { ADJUST_ACTIONS, spokenDuration, stepValue } from "@/lib/slider";

const KNOB = 28;
const SPRING = { damping: 24, stiffness: 220, overshootClamping: true };

/**
 * A duration picker you drag, and step.
 *
 * The knob snaps to `step`-minute increments with a haptic tick on each, and
 * external changes to `value` -- a preset chip -- spring it into place without
 * fighting an in-progress drag.
 *
 * IT IS ALSO STEPPABLE, which is what makes it usable at all with a screen
 * reader running. A swipe under VoiceOver or TalkBack moves the reader's own
 * cursor and never reaches the pan handler, so `accessibilityRole="adjustable"`
 * is the platform's way in: it turns swipe-up and swipe-down into the two
 * actions handled below. Without them this control has exactly one input
 * gesture and it is the one the reader has taken.
 *
 * The arithmetic lives in `lib/slider.ts` rather than here, because a step
 * computed inside a gesture callback is a step no test can ask about -- and
 * "does the last value remain reachable" is a question worth being able to
 * ask.
 */
export function IntervalSlider({
  value,
  onChange,
  min = 15,
  max = 480,
  step = 15,
  minLabel = "15 min",
  maxLabel = "8 h",
  label = "Durata parcării",
  className,
}: {
  value: number;
  onChange: (minutes: number) => void;
  min?: number;
  max?: number;
  step?: number;
  minLabel?: string;
  maxLabel?: string;
  /** What the control is, for a reader. The visible heading is separate. */
  label?: string;
  className?: string;
}) {
  const [trackW, setTrackW] = useState(0);
  const x = useSharedValue(0);
  const lastStep = useSharedValue(Math.round((value - min) / step));
  const dragging = useSharedValue(false);
  const usable = Math.max(1, trackW - KNOB);
  const steps = Math.max(1, Math.round((max - min) / step));

  // Keep the knob in sync when the value changes from outside (preset chips) or
  // once the track has been measured, but never override an active drag.
  useEffect(() => {
    if (dragging.value) return;
    const v = Math.min(max, Math.max(min, value));
    x.value = withSpring(((v - min) / Math.max(1, max - min)) * usable, SPRING);
    lastStep.value = Math.round((v - min) / step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, trackW, min, max]);

  const report = (v: number) => {
    haptics.selection();
    onChange(v);
  };

  /* One step in either direction, for a reader's swipe. `stepValue` tidies a
     value that arrived off the grid from a drag, so a slider left at 47
     minutes steps to 60 rather than to 62 -- see lib/slider.ts. */
  const nudge = (direction: 1 | -1) =>
    report(stepValue(value, direction, { min, max, step }));

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          dragging.value = true;
        })
        .onChange((e) => {
          const nx = x.value + e.changeX;
          x.value = nx < 0 ? 0 : nx > usable ? usable : nx;
          const s = Math.round((x.value / usable) * steps);
          if (s !== lastStep.value) {
            lastStep.value = s;
            runOnJS(report)(Math.min(max, min + s * step));
          }
        })
        .onFinalize(() => {
          dragging.value = false;
          const s = Math.round((x.value / usable) * steps);
          x.value = withSpring((s / steps) * usable, SPRING);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [usable, steps, min, step, max],
  );

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));
  const fillStyle = useAnimatedStyle(() => ({
    width: x.value + KNOB / 2,
  }));

  const tickCount = steps > 12 ? 9 : steps + 1;

  return (
    <View className={className}>
      <View
        onLayout={(e: LayoutChangeEvent) => setTrackW(e.nativeEvent.layout.width)}
        style={{ height: KNOB, justifyContent: "center" }}
        /* The whole track is the control, not the knob: a reader's cursor
           lands on one element, and a 28px knob is also below the 44px target
           anybody tapping with an unsteady hand needs. */
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{
          min,
          max,
          now: value,
          /* Said instead of the number, not beside it. "90" leaves the
             listener to do the division; "o oră și 30 de minute" does not. */
          text: spokenDuration(value),
        }}
        accessibilityActions={ADJUST_ACTIONS}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "increment") nudge(1);
          if (event.nativeEvent.actionName === "decrement") nudge(-1);
        }}
      >
        {/* Base track */}
        <View className="h-2 rounded-full bg-secondary" />

        {/* Hour ticks */}
        <View
          pointerEvents="none"
          className="absolute inset-x-0 flex-row justify-between"
          style={{ paddingHorizontal: KNOB / 2 }}
        >
          {Array.from({ length: tickCount }).map((_, i) => (
            <View key={i} className="h-2 w-px rounded-full bg-border" />
          ))}
        </View>

        {/* Filled portion */}
        <Animated.View
          style={fillStyle}
          pointerEvents="none"
          className="absolute left-0 h-2 rounded-full bg-primary"
        />

        {/* Knob */}
        <GestureDetector gesture={pan}>
          <Animated.View
            /* Hidden from the reader: the track above is the control, and a
               knob announced separately would be a second thing to swipe past
               that adjusts nothing. */
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              knobStyle,
              {
                width: KNOB,
                height: KNOB,
              },
            ]}
            className="absolute left-0 items-center justify-center rounded-full border-4 border-background bg-primary"
          >
            <View className="flex-row gap-[3px]">
              <View className="h-3 w-px rounded-full bg-primary-foreground/50" />
              <View className="h-3 w-px rounded-full bg-primary-foreground/50" />
            </View>
          </Animated.View>
        </GestureDetector>
      </View>

      {/* Range labels */}
      <View className="mt-2 flex-row justify-between">
        <Text className="font-mid text-[11px] text-muted-foreground">
          {minLabel}
        </Text>
        <Text className="font-mid text-[11px] text-muted-foreground">
          {maxLabel}
        </Text>
      </View>
    </View>
  );
}
