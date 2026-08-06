import { useRouter } from "expo-router";
import { KeyRound, TriangleAlert } from "lucide-react-native";
import { ReactNode } from "react";
import { Image, Pressable, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/ui/text";
import { palette } from "@/constants/theme";
import { floatingTabBarInset } from "@/constants/layout";
import { haptics } from "@/lib/haptics";

const REPORT_IMAGE = require("../../assets/images/report-car.jpg");
const SPOT_IMAGE = require("../../assets/images/add-parking.jpg");

type ActionCardProps = {
  image: number;
  icon: ReactNode;
  title: string;
  subtitle: string;
  reverse?: boolean;
  onPress: () => void;
};

function ActionCard({ image, icon, title, subtitle, reverse, onPress }: ActionCardProps) {
  return (
    <Pressable onPress={onPress} className="flex-1 active:opacity-90">
      <View
        className={`flex-1 flex-row items-stretch gap-4 overflow-hidden rounded-lg border-hairline border-border bg-card p-3 ${
          reverse ? "flex-row-reverse" : ""
        }`}
      >
        <View className="w-[46%] self-stretch overflow-hidden rounded-lg border-2 border-primary">
          <Image source={image} resizeMode="cover" className="h-full w-full" />
        </View>
        <View className="flex-1 justify-between px-2 py-3">
          <View>
            <Text className="font-title text-xl leading-6 text-foreground">{title}</Text>
            <Text className="mt-2 font-mid text-sm leading-5 text-muted-foreground">{subtitle}</Text>
          </View>
          <View className={`flex-row ${reverse ? "justify-start" : "justify-end"}`}>
            {icon}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function AddScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <View
        className="flex-1 gap-4 px-5 pt-4"
        style={{ paddingBottom: floatingTabBarInset(insets.bottom) }}
      >
        <ActionCard
          image={REPORT_IMAGE}
          icon={<TriangleAlert size={26} color={palette.indigo[600]} />}
          title="Raportează un blocaj"
          subtitle="Mașini pe trotuar, rampă sau trecere."
          onPress={() => {
            haptics.selection();
            router.push("/report");
          }}
        />
        {/* Only spots somebody owns. There is deliberately no "announce a free
            public kerb" beside it: that is a stranger's claim about ground
            nobody owns. Public spaces come from datasets. */}
        <ActionCard
          image={SPOT_IMAGE}
          icon={<KeyRound size={26} color={palette.indigo[600]} />}
          title="Adaugă un loc de parcare"
          subtitle="Locul tău, pe intervalele tale."
          reverse
          onPress={() => {
            haptics.selection();
            router.push("/add-spot");
          }}
        />
      </View>
    </SafeAreaView>
  );
}
