import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { View } from "react-native";

import { cn } from "@/lib/utils";

/**
 * A rounded label on the card surface: a price, a status, a hint over a map.
 *
 * The same `rounded-full border-hairline border-border bg-card` appeared in
 * eight places with five different paddings, which is not five decisions but
 * one decision made five times by hand. Sizes are named here so that the
 * padding is chosen from a list rather than typed, and so a change to the
 * surface reaches every chip in the app.
 *
 * A `View` rather than a `Pressable`: a chip states something. When one needs
 * to be tapped, wrap it — that keeps "is this a control" visible at the call
 * site instead of hidden in a prop.
 */
const chipVariants = cva(
  "flex-row items-center rounded-full border-hairline border-border",
  {
    variants: {
      size: {
        /** Tight, for a badge sitting over an image or a map. */
        sm: "gap-1.5 px-2.5 py-1",
        /** The usual: a fact about a spot, read at rest. */
        default: "gap-1.5 px-3 py-1.5",
      },
      surface: {
        card: "bg-card",
        /** Slightly translucent, for chips that sit over a map or a photo. */
        floating: "bg-card/95",
        /** For badges over the yellow hero, where the card white is too loud. */
        muted: "bg-background/80",
      },
    },
    defaultVariants: { size: "default", surface: "card" },
  },
);

type ChipProps = React.ComponentProps<typeof View> &
  VariantProps<typeof chipVariants>;

export function Chip({ className, size, surface, children, ...props }: ChipProps) {
  return (
    <View className={cn(chipVariants({ size, surface }), className)} {...props}>
      {children}
    </View>
  );
}
