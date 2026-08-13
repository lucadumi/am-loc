import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { View } from "react-native";

import { IconButton } from "@/components/ui/icon-button";
import { Text } from "@/components/ui/text";
import { useColors } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

export function ScreenHeader({
  title,
  className,
}: {
  title?: string;
  className?: string;
}) {
  const colors = useColors();
  const router = useRouter();
  return (
    <View
      className={cn(
        "flex-row items-center justify-between px-5 py-3",
        className,
      )}
    >
      <IconButton
        size="sm"
        onPress={() => router.back()}
        accessibilityLabel="Înapoi"
      >
        <ArrowLeft size={20} color={colors.foreground} />
      </IconButton>
      {title ? (
        <Text className="font-title text-lg text-foreground">{title}</Text>
      ) : (
        <View />
      )}
      {/* Balances the button so the title sits centred. */}
      <View className="h-10 w-10" />
    </View>
  );
}
