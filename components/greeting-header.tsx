import { MapPin } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { palette } from "@/constants/theme";
import { cn } from "@/lib/utils";

/** Initials for the avatar, from however many words the name has. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function GreetingHeader({
  name = "Șofer",
  location = "Universitate, București",
  onProfile,
  onPrimary = false,
}: {
  /** The full name. The greeting uses the first word, the avatar the initials. */
  name?: string;
  /** Current (mock) location, shown read-only; changing it is disabled. */
  location?: string;
  onProfile?: () => void;
  /** Style for placement over the yellow hero (dark elements on yellow). */
  onPrimary?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <View className="flex-1 pr-3">
        <Text
          numberOfLines={1}
          className={cn(
            "font-title text-lg",
            onPrimary ? "text-primary-foreground" : "text-foreground",
          )}
        >
          Bine ai revenit, {name.trim().split(/\s+/)[0]}
        </Text>
        <View className="mt-1 flex-row items-center gap-1">
          <MapPin size={13} color={palette.indigo[600]} />
          <Text
            numberOfLines={1}
            className={cn(
              "font-mid text-xs",
              onPrimary ? "text-primary-foreground/80" : "text-muted-foreground",
            )}
          >
            {location}
          </Text>
        </View>
      </View>
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={onProfile}
          className={cn(
            "h-11 w-11 items-center justify-center rounded-full",
            onPrimary ? "bg-primary-foreground" : "bg-primary",
          )}
          accessibilityRole="button"
          accessibilityLabel="Profil"
        >
          <Text
            className={cn(
              "font-heavy text-base",
              onPrimary ? "text-primary" : "text-primary-foreground",
            )}
          >
            {initialsOf(name)}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
