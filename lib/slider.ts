/**
 * The arithmetic behind the controls you drag, and the words that describe
 * them out loud.
 *
 * Two things live here for one reason: both are what an accessible slider
 * needs and neither can be tested where it currently sits. `RangeSlider` and
 * `IntervalSlider` compute their steps inside `useAnimatedStyle` callbacks
 * that only run on a device, so the question "what is the next value up from
 * here" has no answer a test can ask for -- and that question is precisely
 * what `accessibilityIncrements` has to answer for somebody who cannot drag.
 *
 * ---
 *
 * WHY A SCREEN READER CANNOT USE A SLIDER THAT ONLY PANS. With VoiceOver or
 * TalkBack running, a swipe is taken by the reader to move its own cursor; it
 * never reaches a pan handler. The platform's answer is
 * `accessibilityRole="adjustable"`, which turns swipe-up and swipe-down into
 * `onAccessibilityAction` calls named `increment` and `decrement` -- so an
 * accessible slider is not a slider with labels bolted on, it is a slider that
 * can also be *stepped*. That is arithmetic, and it belongs somewhere it can
 * be checked.
 *
 * Pure, with no imports at all, so `node --test` loads it.
 */

/**
 * The two actions a screen reader turns a swipe into on an adjustable control.
 *
 * A frozen constant rather than a literal at each call site, because an array
 * built inline is a new array on every render and React Native ships it across
 * the bridge each time. Three sliders re-sending the same two strings on every
 * keystroke of a form is not free.
 *
 * The labels are what VoiceOver reads from the rotor; TalkBack composes its
 * own. Both are given rather than left to the platform, because the defaults
 * are English.
 */
export const ADJUST_ACTIONS = [
  { name: "increment", label: "mărește" },
  { name: "decrement", label: "micșorează" },
] as const;

/** Keep a value inside its bounds. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The next value up or down, snapped to the step and kept inside the bounds.
 *
 * `direction` is +1 or -1. Snapping to the step matters more than it looks:
 * without it, a value that started life as a drag -- 47 minutes, say -- would
 * step to 62 and then 77, and a person stepping a slider by ear would never
 * land on a round number. Rounding onto the grid first means the first step
 * tidies the value and every step after it is a whole one.
 */
export function stepValue(
  value: number,
  direction: 1 | -1,
  { min, max, step }: { min: number; max: number; step: number },
): number {
  /* Rounded to the grid point *in the direction of travel*, not the nearest
     one. Rounding to nearest looks equivalent and is not: from 47 with a step
     of 15 the nearest grid point is 45, so stepping up would "advance" to 45
     and then 60, and the first press of the up action would move the value
     down. Ceiling going up and floor going down means an off-grid value tidies
     itself on the first press and moves a whole step on every one after. */
  const steps = (value - min) / step;
  const toward =
    direction > 0
      ? Math.ceil(steps - EPSILON) * step + min
      : Math.floor(steps + EPSILON) * step + min;

  /* A value already on the grid has nothing to tidy, so it moves a whole step.
     Compared with a tolerance because `value` may have arrived from a drag
     through a float multiplication, and an exact `===` would leave such a
     value stepping by remainders forever. */
  const next =
    Math.abs(toward - value) < EPSILON ? value + direction * step : toward;

  return clamp(next, min, max);
}

/** Smaller than any step this app uses, larger than float noise. */
const EPSILON = 1e-9;

/**
 * Where a value sits along its track, as a fraction from 0 to 1.
 *
 * Shared by the visual fill and by nothing else today. It is here rather than
 * inline so the two sliders cannot drift into two spellings of it, which is
 * how one ends up a pixel short of its own end stop.
 */
export function fractionOf(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

/** The value at a fraction along the track, snapped to the step. */
export function valueAt(
  fraction: number,
  { min, max, step }: { min: number; max: number; step: number },
): number {
  const raw = min + clamp(fraction, 0, 1) * (max - min);
  return clamp(Math.round((raw - min) / step) * step + min, min, max);
}

/**
 * A duration in minutes, as somebody would say it.
 *
 * For `accessibilityValue.text`, which is what a screen reader announces
 * instead of the number. "90" is what the slider holds; "1 oră 30 de minute"
 * is what it means, and a reader saying "ninety" leaves the listener to do the
 * division.
 */
export function spokenDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minute`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourPart = hours === 1 ? "o oră" : `${hours} ore`;
  if (!rest) return hourPart;
  return `${hourPart} și ${rest} de minute`;
}

/**
 * A price range, as somebody would say it.
 *
 * The upper bound doubles as "no maximum" in the filter sheet, so the caller
 * says which value means that rather than this module guessing: a range that
 * announced "up to 20 lei" when it meant "any price" would have a driver
 * believe they had excluded the expensive half of the city.
 */
export function spokenPriceRange(
  [low, high]: [number, number],
  { unbounded }: { unbounded: number },
): string {
  const from = low === 0 ? "gratuit" : `${low} lei`;
  if (high >= unbounded) {
    return low === 0 ? "orice preț" : `de la ${from} în sus`;
  }
  return `de la ${from} până la ${high} lei pe oră`;
}
