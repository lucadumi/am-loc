import { View } from "react-native";

import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";
import { palette, statusColor, statusLabel } from "@/constants/theme";
import { cn } from "@/lib/utils";
import { SpotStatus } from "@/types";

export function StatusBadge({
  status,
  dotOnly = false,
  unknown = false,
  className,
}: {
  status: SpotStatus;
  /** Show only the colored dot (no label pill). */
  dotOnly?: boolean;
  /**
   * True when nobody has reported on this spot.
   *
   * A spot with no observation is flattened to `taken`, which is the safe
   * default for filtering and ranking but not a thing to say out loud: it
   * would have the badge assert "Ocupat" about a car park nobody has looked
   * at, and 838 of the 851 imported ones are in exactly that position. Drawn
   * grey and worded as a question instead.
   */
  unknown?: boolean;
  className?: string;
}) {
  const color = unknown ? palette.mutedForeground : statusColor[status];
  const label = unknown ? "Nu se știe" : statusLabel[status];

  if (dotOnly) {
    return (
      <View
        accessibilityLabel={label}
        className={cn(
          "h-4 w-4 rounded-full border-2 border-background",
          className,
        )}
        style={
          unknown
            ? { borderColor: color, backgroundColor: palette.background }
            : { backgroundColor: color }
        }
      />
    );
  }

  return (
    <Chip size="sm" surface="muted" className={className}>
      {/* Hollow for an unknown, so the state is told apart by shape as well as
          by colour — the same device `ConfidenceBadge` uses. */}
      <View
        className="h-2 w-2 rounded-full"
        style={
          unknown
            ? { borderWidth: 1.5, borderColor: color }
            : { backgroundColor: color }
        }
      />
      <Text className="font-semi text-xs" style={{ color }}>
        {label}
      </Text>
    </Chip>
  );
}
