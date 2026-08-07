import { View } from "react-native";

import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";
import { confidenceColor, confidenceLabel } from "@/constants/theme";
import type { ConfidenceLevel } from "@/lib/spot-state";

/**
 * How much to believe a spot, drawn next to what it claims.
 *
 * Deliberately not merged into `StatusBadge`. A status and a confidence are
 * different facts, and a driver deciding whether to cross town needs to read
 * both: "Liber" answers what someone saw, this answers whether it is still
 * worth acting on. Showing only the first is what sends people to spots that
 * went twenty minutes ago.
 */
export function ConfidenceBadge({
  level,
  className,
}: {
  level: ConfidenceLevel;
  className?: string;
}) {
  const color = confidenceColor[level];
  const uncertain = level === "stale" || level === "none" || level === "disputed";

  return (
    <Chip size="sm" surface="muted" className={className}>
      {/* A hollow ring for anything uncertain, so the two states are told
          apart by shape and not only by colour. */}
      <View
        className="h-2 w-2 rounded-full"
        style={
          uncertain
            ? { borderWidth: 1.5, borderColor: color }
            : { backgroundColor: color }
        }
      />
      <Text className="font-semi text-xs" style={{ color }}>
        {confidenceLabel[level]}
      </Text>
    </Chip>
  );
}
