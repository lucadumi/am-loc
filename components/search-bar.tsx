import { Search } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { palette } from "@/constants/theme";
import { cn } from "@/lib/utils";

export function SearchBar({
  value,
  onChangeText,
  onSubmit,
  onPress,
  placeholder = "Caută o destinație…",
  className,
}: {
  value?: string;
  onChangeText?: (t: string) => void;
  onSubmit?: () => void;
  /**
   * When set, the bar becomes a button (no live input) that calls this on tap,
   * e.g. the home bar jumping to the full search on the map.
   */
  onPress?: () => void;
  placeholder?: string;
  className?: string;
}) {
  if (onPress) {
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

  return (
    <View className={cn("flex-row items-center gap-3", className)}>
      <Input
        className="flex-1"
        icon={<Search size={20} color={palette.mutedForeground} />}
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
      />
    </View>
  );
}
