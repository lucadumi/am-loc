import { Search } from "lucide-react-native";
import { Pressable, StyleProp, View, ViewStyle } from "react-native";

import { fieldSurface } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { palette } from "@/constants/theme";
import { cn } from "@/lib/utils";

/**
 * The search entry point: a field-shaped button that opens the search screen.
 *
 * Deliberately not a live `TextInput`. Typing happens on the screen this leads
 * to, so the bar on the home and map screens has nothing to hold — and a field
 * that takes focus here would put a keyboard over the map for a query it cannot
 * answer.
 */
export function SearchBar({
  onPress,
  placeholder = "Unde vrei să mergi?",
  className,
  style,
  accent,
}: {
  onPress: () => void;
  placeholder?: string;
  className?: string;
  /**
   * For the field's own surface, not the row around it.
   *
   * The map needs a shadow here and the home screen does not: on yellow the bar
   * is already distinct, and over a map it would otherwise float on nothing.
   * Applied to the rounded surface rather than the wrapper, because a shadow
   * cast by a square parent around a round child is the wrong shape.
   */
  style?: StyleProp<ViewStyle>;
  /**
   * The brand colour on the field's edge, resting as well as active.
   *
   * A class rather than a `borderColor` in `style`, because `fieldSurface`
   * already carries `border-border` and the two were fighting -- `cn` runs
   * tailwind-merge, so the later class simply replaces the earlier one, which
   * an inline colour could not be relied on to do.
   */
  accent?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={placeholder}
      className={cn("flex-row items-center gap-3", className)}
    >
      <View
        className={cn(fieldSurface, "flex-1", accent && "border-primary")}
        style={style}
      >
        <Search size={20} color={accent ? palette.primary : palette.mutedForeground} />
        {/* Sized through `style`, not `text-base`, for the same reason as
            `Input`: the utility carries a 24px line height that leaves the
            glyphs sitting low in their box. These two are the same shape and
            have to sit at the same height. */}
        <Text
          className="flex-1 font-sans text-muted-foreground"
          style={{ fontSize: 16 }}
        >
          {placeholder}
        </Text>
      </View>
    </Pressable>
  );
}
