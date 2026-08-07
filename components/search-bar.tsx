import { Search } from "lucide-react-native";
import { Pressable, View } from "react-native";

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
  placeholder = "Caută o destinație…",
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
      <View className="h-14 flex-1 flex-row items-center gap-2 rounded-full border-hairline border-border bg-card px-4">
        <Search size={20} color={palette.mutedForeground} />
        <Text className="flex-1 font-sans text-base text-muted-foreground">
          {placeholder}
        </Text>
      </View>
    </Pressable>
  );
}
