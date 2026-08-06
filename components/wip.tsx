import { ArrowLeft, Construction } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Text } from "@/components/ui/text";
import { palette } from "@/constants/theme";

/**
 * Placeholder for screens that are not built yet. Stack/modal screens pass
 * `onBack` to get a back button; root tab screens omit it.
 */
export function WorkInProgress({
  title,
  onBack,
}: {
  title: string;
  onBack?: () => void;
}) {
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      {onBack ? (
        <View className="px-5 pt-2">
          <Pressable
            onPress={onBack}
            className="h-10 w-10 items-center justify-center rounded-full border-hairline border-border bg-card"
            accessibilityRole="button"
            accessibilityLabel="Înapoi"
          >
            <ArrowLeft size={20} color={palette.foreground} />
          </Pressable>
        </View>
      ) : null}
      <View className="flex-1 items-center justify-center gap-4 px-10">
        <View className="h-24 w-24 items-center justify-center rounded-full bg-secondary">
          <Construction
            size={44}
            color={palette.mutedForeground}
            strokeWidth={1.6}
          />
        </View>
        <Text className="font-title text-2xl text-foreground">{title}</Text>
        <Text className="text-center font-mid text-sm leading-5 text-muted-foreground">
          Secțiune în lucru. Revenim în curând.
        </Text>
      </View>
    </SafeAreaView>
  );
}
