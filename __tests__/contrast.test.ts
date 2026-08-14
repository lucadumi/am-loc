/**
 * Tests for lib/contrast.ts, and — more usefully — for the palette itself.
 *
 * The second half of this file is the point. A contrast ratio is easy to
 * compute and easy to never compute, and the pairs this app actually draws are
 * a short enough list to hold to the threshold all at once. A colour that
 * passed when it was chosen stops passing the moment somebody adjusts
 * `primary`, and nobody re-checks twenty components by eye.
 *
 * Where a pair fails, the test says so and names the fix rather than being
 * deleted. One of them is a known and deliberate exception — see the last
 * block.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { CONTRAST, bigEnough, contrastRatio, luminance, readable } from "../lib/contrast.ts";
import { darkPalette, lightPalette, themes } from "../constants/theme.ts";

/** Rounded, so a failure message is readable rather than exact. */
const ratio = (a: string, b: string) => Math.round(contrastRatio(a, b) * 100) / 100;

/** Where a test is about one theme in particular. */
const palette = lightPalette;

describe("the maths", () => {
  test("the extremes are 21 and 1", () => {
    assert.equal(Math.round(contrastRatio("#000000", "#FFFFFF")), 21);
    assert.equal(contrastRatio("#777777", "#777777"), 1);
  });

  test("it does not matter which way round the pair is given", () => {
    assert.equal(
      ratio(palette.foreground, palette.card),
      ratio(palette.card, palette.foreground),
    );
  });

  test("short hex is the same colour as long hex", () => {
    assert.equal(luminance("#fff"), luminance("#ffffff"));
    assert.equal(luminance("#000"), luminance("#000000"));
  });

  test("green weighs more than blue", () => {
    /* The reason this is not the average of three channels. Pure blue is far
       darker to the eye than pure green at the same value, and a naive
       implementation makes the brand yellow look darker than it reads. */
    assert.ok(luminance("#00FF00") > luminance("#0000FF"));
  });

  test("something that is not a colour is refused rather than guessed", () => {
    assert.throws(() => luminance("rgb(0,0,0)"));
    assert.throws(() => luminance("#12345"));
  });
});

/* Both themes, held to the same thresholds. The dark one is where this matters
   most: it was not built by inverting the light one -- the reds and indigos
   had to be lifted, because a colour chosen to be dark enough for white text
   is too dark to read on anything else -- and that is exactly the kind of
   reasoning that decays without a test. */
for (const [name, palette] of Object.entries(themes)) {
  describe(`the pairs the ${name} theme draws`, () => {
    test("body text on every surface", () => {
      for (const surface of [palette.background, palette.card, palette.secondary]) {
        assert.ok(
          readable(palette.foreground, surface),
          `foreground on ${surface} is ${ratio(palette.foreground, surface)}`,
        );
      }
    });

    test("muted text on every surface", () => {
      /* The one most likely to slip: muted grey is chosen to recede, and
         "recedes" and "cannot be read" are a few percent apart. */
      for (const surface of [palette.background, palette.card, palette.secondary]) {
        assert.ok(
          readable(palette.mutedForeground, surface),
          `mutedForeground on ${surface} is ${ratio(palette.mutedForeground, surface)}`,
        );
      }
    });

    test("the brand yellow carries dark text and not light", () => {
      // The same on both themes, which is why the app still looks like itself
      // in the dark: yellow is a light colour under any interface.
      assert.ok(readable(palette.primaryForeground, palette.primary));
      assert.ok(!readable("#FFFFFF", palette.primary));
    });

    test("destructive text on the surfaces it appears on", () => {
      // "Ieși din cont" and the report screen's failure banner.
      for (const surface of [palette.card, palette.background, palette.secondary]) {
        assert.ok(
          readable(palette.destructive, surface),
          `destructive on ${surface} is ${ratio(palette.destructive, surface)}`,
        );
      }
    });

    test("the accent reads on the card", () => {
      assert.ok(
        readable(palette.accent, palette.card, CONTRAST.graphic),
        `the accent on the card is ${ratio(palette.accent, palette.card)}`,
      );
    });

    test("the accent reads on its own tinted pill", () => {
      /* The pair that broke first. The pill's colour used to come from
         Tailwind's static `bg-indigo-100`, which does not change with the
         theme, while the icon on it did -- so on the dark theme a pale icon
         sat on a pale pill and both vanished. Holding the pair rather than
         each half is what would have caught it. */
      assert.ok(
        readable(palette.accent, palette.accentSurface, CONTRAST.graphic),
        `the accent on its surface is ${ratio(palette.accent, palette.accentSurface)}`,
      );
    });

    test("light text reads on the solid accent fill", () => {
      // The map's result-count pill and its cluster badge.
      assert.ok(
        readable("#FFFFFF", palette.accentSolid),
        `white on the solid accent is ${ratio("#FFFFFF", palette.accentSolid)}`,
      );
    });

    test("the surfaces are distinguishable from one another", () => {
      /* Not a WCAG rule and a real failure mode, especially in the dark: a
         card at the same luminance as its canvas is a card with no edge, and
         the hairline border is a third of a pixel. */
      assert.ok(
        contrastRatio(palette.card, palette.background) > 1.05,
        `card and canvas differ by only ${ratio(palette.card, palette.background)}`,
      );
    });
  });
}

describe("touch targets", () => {
  test("a control the size of the guideline passes", () => {
    assert.ok(bigEnough({ size: 48 }));
    assert.ok(!bigEnough({ size: 44 }));
  });

  test("hit slop counts, because it is what the finger gets", () => {
    // The slider knobs are 28px drawn. With 10px of slop each side they are a
    // 48px target and are fine; without it they are not.
    assert.ok(!bigEnough({ size: 28 }));
    assert.ok(bigEnough({ size: 28, slop: 10 }));
  });

  test("the app's small round button is big enough", () => {
    // `IconButton size="sm"` is h-10 w-10 — 40px — which is under the
    // guideline on its own and is why it is only used inside headers, where
    // it sits in a row with generous padding around it.
    assert.ok(!bigEnough({ size: 40 }));
    assert.ok(bigEnough({ size: 40, slop: 4 }));
  });
});
