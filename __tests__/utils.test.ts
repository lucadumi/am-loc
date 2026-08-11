/**
 * Tests for `cn`, the one place class names are merged.
 *
 * Worth testing something this small because of how its failure looks. When
 * the merge gets a class group wrong it does not throw and it does not warn --
 * it silently drops a class, and the screen renders as though somebody had
 * simply not asked for that style. The bug this pins down had exactly that
 * shape: every accented field in the app lost its border width and read as
 * "flat", which survived three hand-written copies without anybody spotting
 * it, because a missing border looks like a design decision.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { cn } from "../lib/utils.ts";

/** As `fieldSurface` in components/ui/input.tsx spells it. */
const FIELD =
  "h-14 flex-row items-center gap-2.5 rounded-full border-hairline border-border bg-card px-5";

describe("cn", () => {
  test("an accented field keeps its width and takes the new colour", () => {
    /* The regression. `border-hairline` is a width from this project's own
       tailwind config, and tailwind-merge treats an unrecognised `border-*` as
       a colour unless told otherwise -- so before `extendTailwindMerge` the
       width was dropped by the colour that followed it, leaving a border with
       nothing to paint. */
    const merged = cn(FIELD, "border-primary").split(" ");
    assert.ok(merged.includes("border-hairline"), "lost the width");
    assert.ok(merged.includes("border-primary"), "lost the colour");
    assert.ok(!merged.includes("border-border"), "kept the colour it replaced");
  });

  test("a real width still overrides the hairline", () => {
    // The other direction has to keep working: `border-hairline` must be in the
    // width group, not merely exempt from the colour one.
    const merged = cn(FIELD, "border-2").split(" ");
    assert.ok(merged.includes("border-2"));
    assert.ok(!merged.includes("border-hairline"));
  });

  test("an untouched field keeps both of its border classes", () => {
    const merged = cn(FIELD).split(" ");
    assert.ok(merged.includes("border-hairline"));
    assert.ok(merged.includes("border-border"));
  });

  test("the ordinary conflicts still resolve last-wins", () => {
    assert.equal(cn("px-4", "px-5"), "px-5");
    assert.equal(cn("bg-card", "bg-primary"), "bg-primary");
  });

  test("conditional and falsy inputs are dropped", () => {
    assert.equal(cn("flex-1", false && "hidden", undefined, null), "flex-1");
  });
});
