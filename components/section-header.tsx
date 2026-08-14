import { type LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { useColors } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

export function SectionHeader({
  title,
  actionIcon: ActionIcon,
  onAction,
  className,
}: {
  title: string;
  actionIcon?: LucideIcon;
  onAction?: () => void;
  className?: string;
}) {
  const colors = useColors();
  return (
    <View className={cn("flex-row items-center justify-between", className)}>
      <Text className="font-title text-lg text-foreground">{title}</Text>
      {ActionIcon ? (
        <Pressable
          onPress={onAction}
          hitSlop={8}
          accessibilityRole="button"
          /* The surface through the theme rather than `bg-indigo-100`, which
             is Tailwind's static scale and stays pale on both. Paired with
             `accent` above, which is the step that reads on it. */
          style={{ backgroundColor: colors.accentSurface }}
          className="rounded-full p-2"
        >
          <ActionIcon size={18} color={colors.accent} strokeWidth={2.2} />
        </Pressable>
      ) : null}
    </View>
  );
}
