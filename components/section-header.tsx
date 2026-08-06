import { type LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { palette } from "@/constants/theme";
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
  return (
    <View className={cn("flex-row items-center justify-between", className)}>
      <Text className="font-title text-lg text-foreground">{title}</Text>
      {ActionIcon ? (
        <Pressable
          onPress={onAction}
          hitSlop={8}
          accessibilityRole="button"
          className="rounded-full bg-indigo-100 p-2"
        >
          <ActionIcon size={18} color={palette.indigo[700]} strokeWidth={2.2} />
        </Pressable>
      ) : null}
    </View>
  );
}
