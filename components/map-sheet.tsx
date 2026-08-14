/**
 * A sheet that lives over the map rather than on top of it.
 *
 * The counterpart of `bottom-sheet.tsx`, and deliberately not a variant of it.
 * That one is modal: it darkens everything behind, closes on a tap outside, and
 * is as tall as whatever it contains. Right for a filter panel, wrong here --
 * this sheet has no backdrop, cannot be dismissed, and the map behind it stays
 * live, because the whole point of searching on a map is watching where the
 * answers land.
 *
 * SNAP POINTS ARE AN ARRAY, not two constants, and that is the one design
 * decision worth defending here. The app ships two -- roughly half the screen,
 * and nearly all of it -- because a third "get out of the way" state would
 * duplicate the map tab, which is already a map with no list on it. But three
 * snap points is a different number in the same array rather than a different
 * component, so if the half-height state turns out to hide too much of the
 * city, the fix is one entry rather than a rewrite of the gesture.
 *
 * ONLY THE HANDLE DRAGS. A sheet whose whole surface is draggable has to
 * arbitrate between "the driver is scrolling the list" and "the driver is
 * moving the sheet", every frame, and getting that wrong feels like the app
 * fighting back. Restricting the drag to the handle and the header costs a
 * gesture people know from other apps and buys a list that always scrolls when
 * scrolled. Worth revisiting once there is something to feel.
 */

import { ReactNode, useEffect, useMemo, useState } from "react";
import { LayoutChangeEvent, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

const SPRING = { damping: 26, stiffness: 240, overshootClamping: true };

/**
 * How hard a flick has to be to carry past the nearest stop.
 *
 * Without it the sheet snaps to whatever it is closest to when the finger
 * lifts, so a fast, short flick -- which is how people actually open these --
 * springs straight back and reads as the app refusing.
 */
const FLICK = 500;

export function MapSheet({
  /** Fractions of the screen, smallest first. `[0.45, 0.88]` is the app's. */
  snapPoints,
  /** False slides it back off the bottom; it stays mounted until it lands. */
  visible,
  onHidden,
  index,
  onIndexChange,
  /** Always visible, and the only part that drags. */
  header,
  /**
   * How far off the bottom of the screen to sit.
   *
   * The tab bar is a pill floating over the page rather than a strip the
   * navigator reserves room for, so a sheet anchored to the very bottom has its
   * last result underneath it. Lifting the whole sheet is the fix the layout
   * constant was written for, and it suits the rest of the screen: the zoom
   * controls and the tab bar already float over the map, and now the sheet does
   * too.
   */
  bottomInset = 0,
  children,
}: {
  snapPoints: number[];
  visible: boolean;
  /** Fired once it has finished leaving, so a caller can drop its contents. */
  onHidden?: () => void;
  index: number;
  onIndexChange: (index: number) => void;
  header: ReactNode;
  bottomInset?: number;
  children: ReactNode;
}) {
  const { height } = useWindowDimensions();
  const [headerH, setHeaderH] = useState(0);

  /* The sheet is always its tallest, and slides down to show less. Resizing it
     per snap point would relayout the list on every drag, which is both janky
     and pointless -- the content that is off the bottom of the screen is the
     content the driver has not scrolled to yet either way. */
  const tallest = useMemo(() => Math.max(...snapPoints), [snapPoints]);
  const sheetH = height * tallest;

  /** How much of the sheet the driver can actually see at the current stop. */
  const visibleH = height * (snapPoints[index] ?? tallest);

  /** Where the sheet sits, as a translation, for each snap point. */
  const offsets = useMemo(
    () => snapPoints.map((point) => sheetH - height * point),
    [snapPoints, sheetH, height],
  );

  /** Fully below the screen, where it waits and where it goes back to. */
  const hidden = sheetH + bottomInset;

  const y = useSharedValue(hidden);
  const start = useSharedValue(0);

  /* Spring rather than a duration, and the same one the drag settles with, so a
     sheet that arrives and a sheet the driver flicks move alike -- an entrance
     with its own easing reads as a different object. */
  useEffect(() => {
    y.value = withSpring(
      visible ? (offsets[index] ?? 0) : hidden,
      SPRING,
      (finished) => {
        if (finished && !visible && onHidden) runOnJS(onHidden)();
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, index, offsets, hidden]);

  const settle = (at: number, velocity: number) => {
    /* Where the finger left it, unless the flick was decisive -- in which case
       one stop along in the direction it was thrown, however far it actually
       travelled. A short, fast flick is how people open these, and snapping it
       back to where it started reads as the app refusing.

       Index 0 is the shortest sheet and therefore the largest offset, so
       downwards (positive velocity) means a lower index. */
    let nearest = 0;
    for (let i = 1; i < offsets.length; i++) {
      if (Math.abs(offsets[i] - at) < Math.abs(offsets[nearest] - at)) nearest = i;
    }

    const target =
      velocity > FLICK
        ? Math.max(0, nearest - 1)
        : velocity < -FLICK
          ? Math.min(offsets.length - 1, nearest + 1)
          : nearest;

    onIndexChange(target);
    y.value = withSpring(offsets[target], SPRING);
  };

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          start.value = y.value;
        })
        .onChange((e) => {
          const next = start.value + e.translationY;
          const min = offsets[offsets.length - 1];
          const max = offsets[0];
          /* Clamped rather than rubber-banded. There is nothing above the tall
             stop and nothing below the short one, so stretching past either
             would promise a state that does not exist. */
          y.value = next < min ? min : next > max ? max : next;
        })
        .onEnd((e) => {
          runOnJS(settle)(y.value, e.velocityY);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [offsets],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
  }));

  return (
    <Animated.View
      style={[sheetStyle, { height: sheetH, bottom: bottomInset }]}
      className="absolute inset-x-0 overflow-hidden rounded-t-3xl bg-background"
    >
      <View
        className="border-b-hairline border-border"
        style={{ shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 12 }}
        onLayout={(e: LayoutChangeEvent) => setHeaderH(e.nativeEvent.layout.height)}
      >
        <GestureDetector gesture={pan}>
          <View>
            {/* The grab handle, hidden from a reader: it is draggable and
                nothing else, and a reader's swipe never reaches the pan
                handler. There is nothing lost -- the sheet's content is
                reachable at any stop, and the stops exist to give the map room
                rather than to hide anything. */}
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              className="items-center pb-2 pt-3"
            >
              <View className="h-1.5 w-10 rounded-full bg-border" />
            </View>
            {header}
          </View>
        </GestureDetector>
      </View>

      {/* Sized to what is actually on screen at this stop, not to the sheet.
      
          The sheet is always its tallest and slides down to show less, so at the
          short stop nearly half of it hangs below the bottom edge. Sizing the
          list to the sheet put that half inside the scroll view's own viewport:
          the last results were laid out below the screen, where scrolling could
          never bring them, and the list simply stopped part way through. Sizing
          it to the visible portion gives the scroll view a viewport that ends
          where the screen does, so everything in it can be reached. */}
      <View style={{ height: visibleH - headerH }}>{children}</View>
    </Animated.View>
  );
}

