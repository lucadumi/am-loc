import { Bike, Bus, Car, Truck } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { palette } from "@/constants/theme";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";

const VEHICLES = [
  { key: "car", label: "Mașină", Icon: Car },
  { key: "moto", label: "Moto", Icon: Bike },
  { key: "truck", label: "Camion", Icon: Truck },
  { key: "bus", label: "Autocar", Icon: Bus },
] as const;

/** Decorative vehicle filter (mock). Mirrors the reference chip row. */
export function VehicleChips({ className }: { className?: string }) {
  const [active, setActive] = useState<string>("car");
  return (
    <View className={cn("flex-row gap-2", className)}>
      {VEHICLES.map(({ key, label, Icon }) => {
        const on = key === active;
        return (
          <Pressable
            key={key}
            onPress={() => {
              haptics.selection();
              setActive(key);
            }}
            className={cn(
              "flex-1 items-center gap-2 rounded-lg border-hairline px-1.5 py-1.5",
              on ? "border-primary bg-primary" : "border-border bg-secondary",
            )}
          >
            <Icon
              size={26}
              color={on ? palette.primaryForeground : palette.foreground}
              strokeWidth={2}
            />
            <Text
              numberOfLines={1}
              className={cn(
                "font-semi text-xs",
                on ? "text-primary-foreground" : "text-foreground",
              )}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
