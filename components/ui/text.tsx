import * as React from "react";
import { Text as RNText } from "react-native";

import { cn } from "@/lib/utils";

/**
 * Base text primitive. Applies Montserrat + foreground color by default so
 * every label reads correctly on the charcoal canvas. Override the family with
 * font-mid / font-semi / font-title / font-heavy and color with text-*.
 */
export function Text({
  className,
  ...props
}: React.ComponentProps<typeof RNText>) {
  return (
    <RNText
      className={cn("font-sans text-base text-foreground", className)}
      {...props}
    />
  );
}
