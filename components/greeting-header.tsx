import { SquareParking } from "lucide-react-native";
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
  subtitle,
  onProfile,
  onPrimary = false,
}: {
  /** The full name. The greeting uses the first word, the avatar the initials. */
  name?: string;
  /**
   * The one line worth reading under the greeting.
   *
   * This was the driver's location until it stopped earning its place: AmLoc
   * covers Bucharest and nowhere else, so a line reading "București" told a
   * driver standing in Bucharest something they already knew, in the most
   * valuable strip of the screen. Whatever goes here should change.
   */
  subtitle?: string;
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
        {subtitle ? (
          <View className="mt-1 flex-row items-center gap-1">
            <SquareParking
              size={13}
              color={onPrimary ? palette.primaryForeground : palette.indigo[600]}
              strokeWidth={2.2}
              style={{ flexShrink: 0 }}
            />
            <Text
              numberOfLines={1}
              className={cn(
                "font-mid text-xs",
                onPrimary ? "text-primary-foreground/80" : "text-muted-foreground",
              )}
            >
              {subtitle}
            </Text>
          </View>
        ) : null}
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
