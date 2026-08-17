import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { useColors } from "@/hooks/use-theme";

/** The hairline between two rows, inset so it does not touch the card's edge. */
export function Divider() {
  return <View className="mx-4 border-t-hairline border-border" />;
}

/**
 * A setting, as a row that opens where it stands.
 *
 * The shape the rest of the app already uses for "a thing with a current value
 * that you can go and change": an icon in a disc, what it is, what it says
 * right now, and a chevron. The home screen's "Ultima parcare" row is the same
 * object.
 *
 * IT OPENS INLINE RATHER THAN PUSHING A SCREEN, and that is the point of the
 * shape. Laid out flat, three settings become three headings, two naked text
 * fields, a switch and four paragraphs of explanation -- a page of forms for
 * things a driver touches once a year, in front of the one fact they came to
 * check. Collapsed, a whole account is four rows deep, and the explaining
 * happens only where somebody has asked to read it.
 *
 * Lives here rather than in the account screen because it is a shape worth
 * having once: "a thing with a current value that you can go and change" turns
 * up wherever settings do, and a second copy would drift a little further from
 * this one with every touch.
 */
export function SettingRow({
  icon,
  title,
  value,
  tint,
  open,
  onPress,
  right,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  /** What it says right now. The reason the row is worth reading closed. */
  value?: string;
  /** Colours the value where it is a state that wants attention. */
  tint?: string;
  open?: boolean;
  onPress?: () => void;
  /** A control that belongs on the row itself, for a setting with two states. */
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const colors = useColors();
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <View>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? "button" : undefined}
        className="flex-row items-center gap-3 px-4 py-3.5 active:opacity-70"
      >
        <View className="h-9 w-9 items-center justify-center rounded-full bg-secondary">
          {icon}
        </View>
        <Text className="flex-1 font-title text-sm">{title}</Text>
        {value ? (
          <Text
            numberOfLines={1}
            className="max-w-[45%] font-mid text-xs text-muted-foreground"
            style={tint ? { color: tint } : undefined}
          >
            {value}
          </Text>
        ) : null}
        {right ??
          (onPress ? <Chevron size={18} color={colors.mutedForeground} /> : null)}
      </Pressable>
      {open && children ? (
        <View className="gap-3 px-4 pb-4">{children}</View>
      ) : null}
    </View>
  );
}
