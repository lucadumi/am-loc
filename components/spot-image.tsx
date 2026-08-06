import { Car, Warehouse } from "lucide-react-native";
import { View } from "react-native";

import { palette } from "@/constants/theme";
import { cn } from "@/lib/utils";
import { SpotKind } from "@/types";

/**
 * Branded flat placeholder for a parking spot. The seed data has no photos, so
 * we render an on-brand solid charcoal panel with a vehicle glyph instead of
 * pulling remote imagery, which keeps the app fast and fully offline.
 */
export function SpotImage({
  kind = "street",
  iconSize = 44,
  className,
}: {
  kind?: SpotKind;
  iconSize?: number;
  className?: string;
}) {
  const Icon = kind === "garage" ? Warehouse : Car;
  return (
    <View
      className={cn(
        "items-center justify-center overflow-hidden bg-secondary",
        className,
      )}
    >
      <Icon size={iconSize} color={palette.mutedForeground} strokeWidth={1.3} />
    </View>
  );
}
