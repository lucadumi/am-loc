import * as React from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { cn } from "@/lib/utils";

/**
 * The canvas every screen sits on.
 *
 * Two shapes, because the app genuinely has two and not because a prop was
 * easier than thinking about it.
 *
 * The default keeps its content below the status bar, which is what a screen
 * with a header wants. `bleed` does not, and is for the screens that paint the
 * top inset themselves: the home screen runs its yellow hero up behind the
 * clock, and the map and detail screens put a map there. Those three used a
 * bare `View` and had to remember to handle the inset, which is fine, but they
 * also each spelled the canvas colour out by hand.
 *
 * Small on purpose. There is no padding here and no scroll: screens differ too
 * much for either to be a default, and a component that guesses would be
 * fought rather than used.
 */
export function Screen({
  children,
  bleed = false,
  className,
}: {
  children: React.ReactNode;
  /** Let content run under the status bar; the screen paints that inset. */
  bleed?: boolean;
  className?: string;
}) {
  if (bleed) {
    return (
      <View className={cn("flex-1 bg-background", className)}>{children}</View>
    );
  }

  return (
    <SafeAreaView edges={["top"]} className={cn("flex-1 bg-background", className)}>
      {children}
    </SafeAreaView>
  );
}
