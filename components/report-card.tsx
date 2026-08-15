import { Camera, ChevronRight, MapPin } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { ReportStatusBadge } from "@/components/report-status-badge";
import { Card } from "@/components/ui/card";
import { IconRow } from "@/components/ui/icon-row";
import { Text } from "@/components/ui/text";
import { reportCategoryColor, reportCategoryIcon } from "@/constants/reports";
import { useColors } from "@/hooks/use-theme";
import { sinceLabel } from "@/lib/bucharest-time";
import { cn } from "@/lib/utils";
import { REPORT_CATEGORIES, type BlockerReport } from "@/types";

/**
 * One complaint, as a row in a list.
 *
 * WHAT IS DELIBERATELY NOT ON IT: the photographs, and the number plate.
 * Neither is available to draw for anybody but the author -- `reports_readable`
 * hands the paths only to them and the plate is revoked on the table -- so a
 * card that tried would render nothing. What replaces them is the *count*: a
 * complaint with four pictures behind it is a stronger complaint than one with
 * none, and saying how many exist gives nothing away.
 *
 * The category is carried by an icon and by its label, never by the colour
 * alone. Five vivid hues at a glance are how a list reads quickly; they are
 * also how it becomes unreadable to somebody who cannot tell orange from rose.
 */
export function ReportCard({
  report,
  onPress,
  className,
}: {
  report: BlockerReport;
  onPress?: () => void;
  className?: string;
}) {
  const colors = useColors();

  const Icon = reportCategoryIcon[report.category];
  const tint = reportCategoryColor[report.category];
  const label =
    REPORT_CATEGORIES.find((c) => c.key === report.category)?.label ??
    report.category;

  const photos = report.photoCount ?? report.photos?.length ?? 0;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      /* One sentence rather than six fragments. A reader landing on this would
         otherwise hear a category, a time, a status and a number with nothing
         saying they describe the same complaint. */
      accessibilityLabel={[
        label,
        report.address,
        sinceLabel(report.createdAt),
        photos ? `${photos} fotografii` : undefined,
      ]
        .filter(Boolean)
        .join(", ")}
      className={cn("active:opacity-80", className)}
    >
      <Card className="flex-row items-center gap-3 p-3.5">
        <View
          className="h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: tint + "1F" }}
        >
          <Icon size={20} color={tint} strokeWidth={2.2} />
        </View>

        <View className="flex-1 gap-1">
          <Text numberOfLines={1} className="font-title text-sm">
            {label}
          </Text>
          <IconRow
            icon={<MapPin size={12} color={colors.mutedForeground} />}
            truncate
          >
            {report.address ?? "Loc nedenumit"}
          </IconRow>
          <View className="mt-0.5 flex-row items-center gap-2">
            <ReportStatusBadge status={report.status} />
            <Text className="font-mid text-[11px] text-muted-foreground">
              {sinceLabel(report.createdAt)}
            </Text>
            {photos ? (
              <IconRow
                icon={<Camera size={11} color={colors.mutedForeground} />}
                textClassName="text-[11px]"
              >
                {String(photos)}
              </IconRow>
            ) : null}
          </View>
        </View>

        <ChevronRight size={18} color={colors.mutedForeground} />
      </Card>
    </Pressable>
  );
}
