import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  return (
    <View className={cn("flex-row rounded-full bg-secondary p-1", className)}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              haptics.selection();
              onChange(o.key);
            }}
            className={cn(
              "flex-1 items-center rounded-full py-2.5",
              active && "bg-primary",
            )}
          >
            <Text
              className={cn(
                "font-semi text-sm",
                active ? "text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
