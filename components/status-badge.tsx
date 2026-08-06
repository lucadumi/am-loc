import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { statusColor, statusLabel } from "@/constants/theme";
import { cn } from "@/lib/utils";
import { SpotStatus } from "@/types";

export function StatusBadge({
  status,
  dotOnly = false,
  className,
}: {
  status: SpotStatus;
  /** Show only the colored dot (no label pill). */
  dotOnly?: boolean;
  className?: string;
}) {
  const color = statusColor[status];

  if (dotOnly) {
    return (
      <View
        accessibilityLabel={statusLabel[status]}
        className={cn(
          "h-4 w-4 rounded-full border-2 border-background",
          className,
        )}
        style={{ backgroundColor: color }}
      />
    );
  }

  return (
    <View
      className={cn(
        "flex-row items-center gap-1.5 rounded-full bg-background/80 px-2.5 py-1",
        className,
      )}
    >
      <View
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <Text className="font-semi text-xs" style={{ color }}>
        {statusLabel[status]}
      </Text>
    </View>
  );
}
