import { forwardRef } from "react";
import { TextInput, View, type TextInputProps } from "react-native";

import { palette } from "@/constants/theme";
import { cn } from "@/lib/utils";

/**
 * The app's text field, and the only way one should be built.
 *
 * Left to style its own `TextInput`, every screen drifts: the padding stops
 * matching and the text sits off-centre. Two things prevent that, and both are
 * easy to forget by hand:
 *
 * A fixed height with the text centred by the row, rather than vertical
 * padding. Padding centres nothing — it just adds space above and below a box
 * whose contents are already aligned to the font's own metrics.
 *
 * `paddingVertical: 0` and `includeFontPadding: false`, because React Native
 * gives `TextInput` its own internal padding on Android and the font adds more
 * on top. Left in, the two push the text down inside an otherwise centred row,
 * and the field looks subtly wrong in a way nobody can name.
 */
export const Input = forwardRef<TextInput, TextInputProps & {
  className?: string;
}>(function Input({ className, ...props }, ref) {
  return (
    <View
      className={cn(
        "h-14 flex-row items-center gap-2.5 rounded-full border-hairline border-border bg-card px-5",
        className,
      )}
    >
      <TextInput
        ref={ref}
        className="flex-1 font-sans text-base text-foreground"
        placeholderTextColor={palette.mutedForeground}
        style={{ paddingVertical: 0, includeFontPadding: false }}
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
