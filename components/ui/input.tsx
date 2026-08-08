import { forwardRef } from "react";
import { TextInput, View, type TextInputProps } from "react-native";

import { palette } from "@/constants/theme";
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
export const Input = forwardRef<TextInput, TextInputProps & {
  className?: string;
}>(function Input({ className, ...props }, ref) {
  return (
    <View
      className={cn(
        fieldSurface,
        className,
      )}
    >
      <TextInput
        ref={ref}
        className="flex-1 font-sans text-foreground"
        placeholderTextColor={palette.mutedForeground}
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
 */
export const TextArea = forwardRef<TextInput, TextInputProps & { className?: string }>(
  function TextArea({ className, ...props }, ref) {
    return (
      <View
        className={cn(
          "min-h-[92px] rounded-3xl border-hairline border-border bg-card px-5 py-4",
          className,
        )}
      >
        <TextInput
          ref={ref}
          multiline
          textAlignVertical="top"
          className="flex-1 font-sans text-base leading-6 text-foreground"
          placeholderTextColor={palette.mutedForeground}
          style={{ paddingVertical: 0, includeFontPadding: false }}
          {...props}
        />
      </View>
    );
  },
);
