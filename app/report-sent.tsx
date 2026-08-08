import { useRouter } from "expo-router";
import { Check, Map as MapIcon } from "lucide-react-native";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";
import { Text } from "@/components/ui/text";
import { palette } from "@/constants/theme";

/**
 * What happens after a blocker report is filed.
 *
 * The flow used to end on `/reports`, which is still a `WorkInProgress`
 * placeholder: the reward for photographing a blocked pavement was a screen
 * saying the screen was not built.
 *
 * It also says what filing does and does not do. A report is a record with
 * photographs and a time, not a tow truck, and a driver who expects the second
 * one files a second report twenty minutes later. Saying so here costs a
 * sentence and is the difference between a tool people keep using and one they
 * decide is broken.
 */
export default function ReportSentScreen() {
  const router = useRouter();

  return (
    <Screen className="justify-between px-6 pb-8 pt-16">
      <View className="flex-1 items-center justify-center gap-4">
        <View
          className="h-24 w-24 items-center justify-center rounded-full"
          style={{ backgroundColor: palette.free + "22" }}
        >
          <Check size={48} color={palette.free} strokeWidth={2.4} />
        </View>

        <Text className="text-center font-title text-2xl text-foreground">
          Sesizare trimisă
        </Text>

        <Text className="max-w-[300px] text-center font-mid text-sm leading-5 text-muted-foreground">
          Apare pe hartă pentru toți șoferii din zonă, cu fotografiile și ora la
          care ai văzut-o.
        </Text>

        <Text className="max-w-[300px] text-center font-mid text-xs leading-4 text-muted-foreground">
          Sesizarea nu cheamă ridicarea mașinii. Rămâne o dovadă datată, pe care
          oricine trece pe acolo o poate închide cu o poză a trotuarului liber.
        </Text>
      </View>

      <View className="gap-3">
        <Button
          label="Vezi pe hartă"
          onPress={() => router.replace("/map")}
          rightIcon={
            <MapIcon size={18} color={palette.primaryForeground} strokeWidth={2.2} />
          }
        />
        <Button
          variant="card"
          label="Înapoi acasă"
          onPress={() => router.replace("/")}
        />
      </View>
    </Screen>
  );
}
