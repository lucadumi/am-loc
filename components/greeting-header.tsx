import { Bell, Bookmark, SquareParking } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { IconRow } from "@/components/ui/icon-row";
import { Text } from "@/components/ui/text";
import { useColors } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

/** Initials for the avatar, from however many words the name has. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * A secondary action beside the avatar.
 *
 * Deliberately not `IconButton`. That primitive draws the card surface with a
 * hairline border, which is right on the light canvas and wrong here: these
 * sit on the yellow hero, where a white pill with a grey outline would punch
 * three holes in it. A wash of the foreground colour is enough separation on
 * yellow and reads as one family with the avatar rather than as three
 * competing buttons.
 *
 * The same size as the avatar, so the three read as one row of controls.
 * They were smaller for a while, on the argument that the account is the
 * primary thing in this corner; on screen that just looked like the avatar
 * had not finished loading.
 */
function HeaderAction({
  icon,
  label,
  onPress,
  onPrimary,
}: {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
  onPrimary: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={cn(
        "h-11 w-11 items-center justify-center rounded-full active:opacity-70",
        onPrimary ? "bg-primary-foreground/10" : "bg-secondary",
      )}
    >
      {icon}
    </Pressable>
  );
}

export function GreetingHeader({
  name = "Șofer",
  subtitle,
  onProfile,
  onNotifications,
  onArchived,
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
  /** Omit either and the button is not drawn, rather than drawn dead. */
  onNotifications?: () => void;
  onArchived?: () => void;
  /** Style for placement over the yellow hero (dark elements on yellow). */
  onPrimary?: boolean;
}) {
  const colors = useColors();
  const actionColor = onPrimary ? colors.primaryForeground : colors.foreground;

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
          <IconRow
            className="mt-1"
            icon={
              <SquareParking
                size={13}
                color={onPrimary ? colors.primaryForeground : colors.accent}
                strokeWidth={2.2}
              />
            }
            truncate
            textClassName={
              onPrimary ? "text-primary-foreground/80" : "text-muted-foreground"
            }
          >
            {subtitle}
          </IconRow>
        ) : null}
      </View>
      <View className="flex-row items-center gap-3">
        {onArchived ? (
          <HeaderAction
            label="Salvate"
            onPress={onArchived}
            onPrimary={onPrimary}
            icon={<Bookmark size={20} color={actionColor} strokeWidth={2} />}
          />
        ) : null}
        {onNotifications ? (
          <HeaderAction
            label="Notificări"
            onPress={onNotifications}
            onPrimary={onPrimary}
            icon={<Bell size={20} color={actionColor} strokeWidth={2} />}
          />
        ) : null}
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
