import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import { TextInput, View, type TextInputProps } from "react-native";

import { useColors } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

/**
 * What a field looks like in this app.
 *
 * Exported because `SearchBar` is field-shaped without being a field: it is a
 * button that opens the search screen, and it had its own copy of these
 * classes with a slightly smaller gap and padding. Two spellings of one shape
 * is how a search bar ends up a few pixels shorter than the input below it and
 * nobody can say why.
 */
export const fieldSurface =
  "h-14 flex-row items-center gap-2.5 rounded-full border-hairline border-border bg-card px-5";

/**
 * The brand colour on a field's edge, in one place.
 *
 * Shared by the pill and the box below, which are different shapes of the same
 * idea: whichever one a screen reaches for, an emphasised field is emphasised
 * the same way. It works by replacement rather than addition -- `cn` runs
 * tailwind-merge, so this simply supersedes the `border-border` the surfaces
 * already carry, which an inline `borderColor` could not be relied on to do.
 *
 * That replacement only lands correctly because `cn` has been told
 * `border-hairline` is a width; left to guess, tailwind-merge reads it as a
 * colour and this class drops the border entirely. See lib/utils.ts.
 */
const ACCENT_EDGE = "border-primary";

/**
 * The field's surface, with or without the brand colour on its edge.
 *
 * `accent` marks a field the screen exists for: the destination bar over the
 * map, the search bar once it is live, the address somebody is signing up
 * with. It was written by hand as `border-primary` in two of those places and
 * as `border-2 border-primary` in a third, which is not one decision made
 * three times -- it is three different edges, and the odd one out was thicker
 * than the others for no reason anybody chose.
 *
 * The width deliberately does not change. A hairline in yellow is already the
 * loudest thing on a white card, and thickening it makes the field look
 * focused when it is merely important.
 *
 * Exported as a function rather than a second string constant so the two
 * consumers that build their own field -- `SearchBar` and `DestinationSearch`,
 * neither of which is a `TextInput` -- get the same answer as `Input` does.
 */
export const fieldVariants = cva(fieldSurface, {
  variants: {
    accent: { true: ACCENT_EDGE, false: "" },
  },
  defaultVariants: { accent: false },
});

/**
 * The app's text field, and the only way one should be built.
 *
 * Left to style its own `TextInput`, every screen drifts: the padding stops
 * matching and the text sits off-centre. Three things prevent that, and all
 * three are easy to forget by hand:
 *
 * A fixed height with the text centred by the row, rather than vertical
 * padding. Padding centres nothing — it just adds space above and below a box
 * whose contents are already aligned to the font's own metrics.
 *
 * `paddingVertical: 0` and `includeFontPadding: false`, because React Native
 * gives `TextInput` its own internal padding on Android and the font adds more
 * on top. Left in, the two push the text down inside an otherwise centred row.
 *
 * AND NO LINE HEIGHT, which is the one that actually bit. `text-base` is not
 * only a size: Tailwind pairs it with `lineHeight: 24px` against a 16px font,
 * so the glyphs get an eight-pixel line box to sit in. Text is positioned on
 * its baseline inside that box rather than centred in it, and Montserrat has
 * tall ascenders, so nearly all of the slack ended up above the text. The
 * field looked right while empty — a placeholder is drawn differently — and
 * sat visibly low the moment anybody typed. The size is set through `style`
 * here precisely so it arrives without a line height attached.
 */
export const Input = forwardRef<
  TextInput,
  TextInputProps & VariantProps<typeof fieldVariants> & { className?: string }
>(function Input({ className, accent, ...props }, ref) {
  const colors = useColors();
  return (
    <View className={cn(fieldVariants({ accent }), className)}>
      <TextInput
        ref={ref}
        className="flex-1 font-sans text-foreground"
        placeholderTextColor={colors.mutedForeground}
        /* Text scales with the system setting by default, which is right
           nearly everywhere and is a trap in a control whose height is fixed:
           at 200% the glyphs are simply cut off by the 56px pill, and clipped
           text is worse than small text because it cannot be read at all.
           Capped rather than switched off -- the field still grows with the
           first two or three steps of the setting, which is where most people
           who change it are. */
        maxFontSizeMultiplier={1.4}
        style={{
          fontSize: 16,
          paddingVertical: 0,
          includeFontPadding: false,
        }}
        {...props}
      />
    </View>
  );
});

/**
 * The same field, for text that runs on.
 *
 * Not a taller `Input`: the text starts at the top rather than being centred,
 * which is what `textAlignVertical` is for, and a full radius on a box this tall
 * would put the first character inside the curve.
 *
 * Takes the same `accent` as `Input`, off the same constant, so a form does not
 * end up with a yellow field above a grey one for no reason but which shape
 * the answer happens to need.
 */
export const textAreaVariants = cva(
  "min-h-[92px] rounded-3xl border-hairline border-border bg-card px-5 py-4",
  {
    variants: {
      accent: { true: ACCENT_EDGE, false: "" },
    },
    defaultVariants: { accent: false },
  },
);

export const TextArea = forwardRef<
  TextInput,
  TextInputProps &
    VariantProps<typeof textAreaVariants> & { className?: string }
>(function TextArea({ className, accent, ...props }, ref) {
  const colors = useColors();
  return (
    <View className={cn(textAreaVariants({ accent }), className)}>
      <TextInput
        ref={ref}
        multiline
        textAlignVertical="top"
        className="flex-1 font-sans text-base leading-6 text-foreground"
        placeholderTextColor={colors.mutedForeground}
        style={{ paddingVertical: 0, includeFontPadding: false }}
        {...props}
      />
    </View>
  );
});
