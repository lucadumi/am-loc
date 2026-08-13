/**
 * Whether a screen reader is running, and whether motion should be damped.
 *
 * Both are read from the platform rather than from a setting of our own, and
 * both are subscribed to rather than sampled once: VoiceOver and TalkBack can
 * be turned on with a triple-click while the app is open, and a control that
 * only asked at mount would stay unusable until the screen was left and come
 * back to.
 *
 * WHY THE APP HAS TO KNOW AT ALL, given that the right answer is usually to
 * build one control that works for everybody. Because the app has a control
 * that genuinely cannot be made to work for everybody: `SlideButton` submits a
 * report when a knob is dragged across a track, and dragging is exactly the
 * gesture a screen reader takes over -- with VoiceOver on, a swipe moves the
 * cursor to the next element and never reaches the pan handler at all. There
 * is no set of accessibility props that makes a drag reachable. What there is
 * is a different control, and this is how the app knows to draw it.
 *
 * `reduceMotion` is here because it is the same subscription shape and the
 * same failure mode: an animation somebody has asked the operating system to
 * stop.
 */

import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * True while VoiceOver, TalkBack or another screen reader is running.
 *
 * Starts false and becomes true a tick later, which is the right way round: a
 * control that assumed a screen reader until told otherwise would flash its
 * accessible variant on every launch for the large majority who have none.
 * The cost of being wrong for one frame is a control that changes shape; the
 * cost of the other default is every user seeing a control built for somebody
 * else.
 */
export function useScreenReader(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let alive = true;

    AccessibilityInfo.isScreenReaderEnabled()
      .then((on) => {
        if (alive) setEnabled(on);
      })
      // Not surfaced, and not fatal: an app that could not ask assumes no
      // screen reader, which is what it would have drawn anyway.
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      setEnabled,
    );

    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}

/**
 * True while the operating system has been asked to reduce motion.
 *
 * Read by anything that moves on its own. A spring that a person has asked the
 * system to stop is not a flourish, it is a symptom -- vestibular disorders
 * make large sliding transitions genuinely unpleasant.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let alive = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        if (alive) setReduce(on);
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduce,
    );

    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  return reduce;
}
