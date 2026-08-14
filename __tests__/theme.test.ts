/**
 * Tests that the app cannot quietly stop following the interface.
 *
 * The dark theme's failure mode is not a crash. A component that imports a
 * palette directly keeps whichever colours the app started in, and what a
 * driver sees is charcoal text on a charcoal card -- a screen that is not
 * broken, just empty. Nothing throws, no test fails, and it is invisible to
 * anybody developing in the same theme they use.
 *
 * So the rule is enforced here rather than remembered: colours reach a
 * component through `useColors()`, and the two palettes stay the same shape.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

import { darkPalette, lightPalette, statusColors, themes } from "../constants/theme.ts";

/** Every `.tsx` under a directory, recursively. */
function screens(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) screens(path, found);
    else if (path.endsWith(".tsx")) found.push(path);
  }
  return found;
}

describe("no component imports a palette directly", () => {
  test("colours come from the hook", () => {
    const offenders = [...screens("app"), ...screens("components")].filter((path) =>
      /import \{[^}]*\b(lightPalette|darkPalette)\b/.test(readFileSync(path, "utf8")),
    );
    assert.deepEqual(
      offenders,
      [],
      `these read a fixed palette and will not follow the interface:\n${offenders.join("\n")}`,
    );
  });

  test("`themes` is not reached into by name either", () => {
    // `themes.light.foreground` is the same bug spelled differently.
    const offenders = [...screens("app"), ...screens("components")].filter((path) =>
      /\bthemes\.(light|dark)\b/.test(readFileSync(path, "utf8")),
    );
    assert.deepEqual(offenders, []);
  });
});

describe("the two palettes stay the same shape", () => {
  test("neither has a token the other lacks", () => {
    /* A missing token is `undefined` passed to a `color` prop, which React
       Native renders as black -- readable on one theme and invisible on the
       other, which is the worst of both. */
    assert.deepEqual(
      Object.keys(lightPalette).sort(),
      Object.keys(darkPalette).sort(),
    );
  });

  test("the indigo ramps have the same steps", () => {
    assert.deepEqual(
      Object.keys(lightPalette.indigo).sort(),
      Object.keys(darkPalette.indigo).sort(),
    );
  });

  test("every token is actually a colour", () => {
    for (const [name, palette] of Object.entries(themes)) {
      for (const [token, value] of Object.entries(palette)) {
        if (token === "indigo") continue;
        assert.match(
          value as string,
          /^(#[0-9a-f]{3,8}|rgba?\()/i,
          `${name}.${token} is ${value}`,
        );
      }
    }
  });

  test("the two are actually different", () => {
    // A dark theme that was copied and not edited passes every other test in
    // this file.
    assert.notEqual(lightPalette.background, darkPalette.background);
    assert.notEqual(lightPalette.foreground, darkPalette.foreground);
  });

  test("the brand yellow is deliberately the same", () => {
    // The one token that does not change, and the reason the app still looks
    // like itself in the dark.
    assert.equal(lightPalette.primary, darkPalette.primary);
    assert.equal(lightPalette.primaryForeground, darkPalette.primaryForeground);
  });
});

describe("status colours follow the theme", () => {
  test("they are derived from whichever palette is passed", () => {
    /* This used to be a constant map built at module load, which is exactly
       the shape that cannot follow a theme. */
    assert.equal(statusColors(lightPalette).free, lightPalette.free);
    assert.equal(statusColors(darkPalette).taken, darkPalette.taken);
  });
});
