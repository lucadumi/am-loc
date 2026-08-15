import { Building2, Check, Clock, Send, UserCheck } from "lucide-react-native";
import { View } from "react-native";

import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";
import { useColors } from "@/hooks/use-theme";
import { reportStatusLabel } from "@/lib/report-view";
import { cn } from "@/lib/utils";
import type { ReportStatus } from "@/types";

/**
 * Where a complaint got to, as a chip.
 *
 * Four states rather than three, and the pair that matters is `cleared` and
 * `resolved`: a passer-by saying the car has gone, and an institution closing
 * the file. They look similar because they are similar news; they are not the
 * same news, and an app that drew them identically would be telling a driver
 * an authority acted when nobody did. So the words differ and the icons
 * differ -- a person against a building -- and only one of them is green.
 *
 * A COLOUR IS NEVER THE WHOLE MESSAGE HERE. Every chip carries its word, which
 * is what makes this readable to somebody who cannot tell the greens from the
 * greys, and what let `StatusBadge` stop writing its label in a status colour
 * when the contrast work found it at 1.6:1. The icon is the third carrier.
 */
export function ReportStatusBadge({
  status,
  className,
}: {
  status: ReportStatus;
  className?: string;
}) {
  const colors = useColors();

  const icon = {
    open: Clock,
    forwarded: Send,
    cleared: UserCheck,
    resolved: Building2,
  }[status];
  const Icon = status === "resolved" ? Check : icon;

  /* Only a resolution is green. A sighting is the app's own word for "somebody
     says so", and dressing it in the colour of a settled thing would be the
     visual half of calling it a resolution. */
  const tint = {
    open: colors.mutedForeground,
    forwarded: colors.accent,
    cleared: colors.leaving,
    resolved: colors.free,
  }[status];

  return (
    <Chip size="sm" className={cn("self-start", className)}>
      <View style={{ flexShrink: 0 }}>
        <Icon size={13} color={tint} strokeWidth={2.4} />
      </View>
      <Text className="font-semi text-xs text-foreground">
        {reportStatusLabel[status]}
      </Text>
    </Chip>
  );
}
