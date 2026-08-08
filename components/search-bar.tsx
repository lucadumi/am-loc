import { Search } from "lucide-react-native";
import { Pressable, View } from "react-native";

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
}: {
  onPress: () => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={placeholder}
      className={cn("flex-row items-center gap-3", className)}
    >
      <View className={cn(fieldSurface, "flex-1")}>
        <Search size={20} color={palette.mutedForeground} />
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
