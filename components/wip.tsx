import { ArrowLeft } from "lucide-react-native";
import { View } from "react-native";

import { Cone } from "@/components/ui/cone";
import { IconButton } from "@/components/ui/icon-button";
import { Screen } from "@/components/ui/screen";
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
    <Screen>
      {onBack ? (
        <View className="px-5 pt-2">
          <IconButton size="sm" onPress={onBack} accessibilityLabel="Înapoi">
            <ArrowLeft size={20} color={palette.foreground} />
          </IconButton>
        </View>
      ) : null}
      <View className="flex-1 items-center justify-center gap-4 px-10">
        <View className="h-24 w-24 items-center justify-center rounded-full bg-secondary">
          <Cone size={48} />
        </View>
        <Text className="font-title text-2xl text-foreground">{title}</Text>
        <Text className="text-center font-mid text-sm leading-5 text-muted-foreground">
          Secțiune în lucru. Revenim în curând.
        </Text>
      </View>
    </Screen>
  );
}
