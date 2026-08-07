import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { Pressable } from "react-native";

import { cn } from "@/lib/utils";

/**
 * A round button with an icon in it, on the app's card surface.
 *
 * There were five of these written out by hand before this file existed: the
 * back button on the detail screen and on `ScreenHeader` and on
 * `WorkInProgress`, the map's zoom controls, and `FloatingControl`, which was
 * already a component doing exactly this and which four other places did not
 * use. Same seven classes each time, three different sizes, and no way to
 * change the surface without finding all five.
 *
 * The sizes are named after the job rather than after their height, so that a
 * later change to what "a control floating over a map" looks like is one edit
 * here instead of a search for `h-12`.
 */
const iconButtonVariants = cva(
  "items-center justify-center rounded-full border-hairline border-border bg-card",
  {
    variants: {
      size: {
        /** In a header or over a photograph: back, close, dismiss. */
        sm: "h-10 w-10",
        /** Floating over a map: zoom, recentre. */
        default: "h-12 w-12",
        /** A primary control on the map, sized to match the search bar. */
        lg: "h-14 w-14",
      },
    },
    defaultVariants: { size: "default" },
  },
);

type IconButtonProps = React.ComponentProps<typeof Pressable> &
  VariantProps<typeof iconButtonVariants>;

export function IconButton({
  className,
  size,
  children,
  ...props
}: IconButtonProps) {
  return (
    <Pressable
      className={cn(iconButtonVariants({ size }), className)}
      accessibilityRole="button"
      {...props}
    >
      {children}
    </Pressable>
  );
}
