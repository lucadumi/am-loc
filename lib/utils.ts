import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Join class names, letting the last one win where two say the same thing.
 *
 * TEACHING IT ABOUT `border-hairline` IS NOT A TIDY-UP. tailwind-merge knows
 * the classes Tailwind ships and nothing about the ones this project adds, so
 * it read `border-hairline` -- a width, from `borderWidth` in
 * tailwind.config.js -- as a *colour*, on the reasonable guess that anything
 * following `border-` that it does not recognise names one.
 *
 * The consequence was silent and visible. Every accented field in the app is
 * `border-hairline border-border` plus `border-primary`, and because the merge
 * thought the first and last were the same kind of thing, it dropped the
 * width: the fields ended up with a colour and nothing to paint, which renders
 * as no border at all. The destination bar over the map, the search bar and
 * every field on the account page were all affected, and each looked merely
 * "flat" rather than broken, which is why it survived being written three
 * times by hand.
 *
 * Declaring it here rather than at the call sites is what makes the fix hold:
 * `cn` is the only merge in the codebase, so nothing has to remember.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "border-w": ["border-hairline"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
