import * as React from "react";
import { View } from "react-native";

import { cn } from "@/lib/utils";

/** An elevated white surface, separated from the canvas by a hairline border. */
export function Card({
  className,
  ...props
}: React.ComponentProps<typeof View>) {
  return (
    <View
      className={cn(
        "rounded-lg border-hairline border-border bg-card",
        className,
      )}
      {...props}
    />
  );
}
