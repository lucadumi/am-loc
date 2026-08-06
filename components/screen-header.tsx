import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { palette } from "@/constants/theme";
import { cn } from "@/lib/utils";

export function ScreenHeader({
  title,
  className,
}: {
  title?: string;
  className?: string;
}) {
  const router = useRouter();
  return (
    <View
      className={cn(
        "flex-row items-center justify-between px-5 py-3",
        className,
      )}
    >
      <Pressable
        onPress={() => router.back()}
        className="h-10 w-10 items-center justify-center rounded-full border-hairline border-border bg-card"
        accessibilityRole="button"
        accessibilityLabel="Înapoi"
      >
        <ArrowLeft size={20} color={palette.foreground} />
      </Pressable>
      {title ? (
        <Text className="font-title text-lg text-foreground">{title}</Text>
      ) : (
        <View />
      )}
      <View className="h-10 w-10" />
    </View>
  );
}
