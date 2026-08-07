import * as React from "react";
import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/**
 * An icon with a label beside it.
 *
 * The app's most repeated shape: a walk time, an area, a price, a rating, a
 * status. Eight components built it by hand, and one detail was got wrong
 * nearly every time -- a flex child shrinks by default and an SVG has no
 * content to stop it, so in a row with a long label the icon quietly rendered
 * at no width at all. The location pin on the home cards was invisible for
 * exactly this reason.
 *
 * `flexShrink: 0` on the icon is therefore the point of this component rather
 * than a detail of it, and `flex-1` on the label is what makes the text give
 * way instead. Anything that needs `numberOfLines` gets it through `truncate`.
 */
export function IconRow({
  icon,
  children,
  truncate = false,
  className,
  textClassName,
}: {
  /** Already sized and coloured by the caller: this does not style icons. */
  icon: React.ReactNode;
  children: React.ReactNode;
  /** Clip the label to one line instead of letting it wrap. */
  truncate?: boolean;
  className?: string;
  textClassName?: string;
}) {
  return (
    <View className={cn("flex-row items-center gap-1", className)}>
      <View style={{ flexShrink: 0 }}>{icon}</View>
      <Text
        numberOfLines={truncate ? 1 : undefined}
        className={cn(
          "font-mid text-xs text-muted-foreground",
          truncate && "flex-1",
          textClassName,
        )}
      >
        {children}
      </Text>
    </View>
  );
}
