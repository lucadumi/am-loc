/**
 * Whether two colours can be read against each other, and whether a control is
 * big enough to hit.
 *
 * Both are arithmetic with a published threshold, which is exactly the kind of
 * question that gets answered by eye and got wrong. The app already carries
 * one instance of each: `Rating` draws yellow stars, and the map's sheet
 * handle and the slider knobs are 28px against the 44 that a guideline asks
 * for.
 *
 * WHY IN A LIBRARY RATHER THAN IN A REVIEW COMMENT. Because the palette is one
 * file and the components are twenty, and a colour pair that passed when it
 * was chosen stops passing the moment somebody adjusts `primary`. A test can
 * hold the whole palette to the threshold at once; a person cannot.
 *
 * The maths is WCAG 2.1's, which is what both stores' accessibility guidance
 * points at: relative luminance with the sRGB gamma expansion, then a ratio
 * offset by 0.05 so that black against black is 1 rather than a division by
 * zero.
 *
 * Pure, with no imports, so `node --test` loads it.
 */

/** `#RGB` or `#RRGGBB` to three channels, 0-255. */
function channels(hex: string): [number, number, number] {
  const raw = hex.replace("#", "").trim();
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;

  if (!/^[0-9a-f]{6}$/i.test(full)) {
    throw new Error(`Not a hex colour: ${hex}`);
  }

  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * How much light a colour puts out, 0 to 1.
 *
 * Not the average of the channels and not "brightness": the eye is far more
 * sensitive to green than to blue, which is why the weights below are so
 * uneven, and each channel is gamma-expanded first because sRGB values are not
 * linear in light. Doing either the easy way makes yellow look darker than it
 * reads, and yellow is this app's brand colour.
 */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  }) as [number, number, number];

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio between two colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * The thresholds, named after what they are for rather than after their level.
 *
 * `graphic` is the one most often missed. It applies to anything that carries
 * meaning without being text -- a status dot, an icon that is the only label,
 * the fill of a slider track -- and it is the reason a pale yellow star on
 * white is a problem even though no text is involved.
 */
export const CONTRAST = {
  /** Body text and anything under 18pt. */
  text: 4.5,
  /** 18pt and up, or 14pt bold. */
  largeText: 3,
  /** Icons, status dots, control boundaries: anything meaningful and not text. */
  graphic: 3,
} as const;

/** Whether a pair clears a threshold. */
export function readable(
  foreground: string,
  background: string,
  threshold: number = CONTRAST.text,
): boolean {
  return contrastRatio(foreground, background) >= threshold;
}

/**
 * The smallest a control may be and still be reliably hit.
 *
 * 44 is Apple's number and Android asks for 48dp; the larger is used, because
 * a control sized for the smaller one on the platform that wants the larger is
 * a control that is too small on that platform.
 *
 * This is about hands, not eyes. A knob of 28px is perfectly visible and is
 * still a knob somebody with a tremor, or a passenger in a moving car, misses
 * repeatedly. `hitSlop` is the usual answer and is invisible in the layout,
 * which is why it has to be checked deliberately.
 */
export const MIN_TARGET = 48;

/**
 * Whether a control is big enough once its hit slop is counted.
 *
 * The slop is what makes a small control acceptable, so it is part of the
 * measurement rather than a footnote to it: a 28px knob with 10px of slop on
 * each side is a 48px target and passes.
 */
export function bigEnough({
  size,
  slop = 0,
}: {
  /** The drawn size, in dp. */
  size: number;
  /** Extra touchable margin on each side. */
  slop?: number;
}): boolean {
  return size + slop * 2 >= MIN_TARGET;
}
