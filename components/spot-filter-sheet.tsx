import { MapPin } from "lucide-react-native";
import { ReactNode } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";

import { BottomSheet } from "@/components/bottom-sheet";
import { IntervalSlider } from "@/components/interval-slider";
import { RangeSlider } from "@/components/range-slider";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { palette } from "@/constants/theme";
import {
  DISTANCE_MAX,
  DISTANCE_MIN,
  DISTANCE_STEP,
  PRICE_MAX,
  PRICE_MIN,
  PRICE_STEP,
  distanceLabel,
  priceLabel,
  spotCountLabel,
} from "@/lib/filters";
import { formatDistance } from "@/lib/geo";
import { haptics } from "@/lib/haptics";
import { SpotFilters, SpotKind } from "@/types";

const KIND_OPTIONS: { key: "all" | SpotKind; label: string }[] = [
  { key: "all", label: "Toate" },
  { key: "street", label: "Stradal" },
  { key: "garage", label: "Garaj" },
];

const RATING_SEGMENTS: { key: string; label: string }[] = [
  { key: "0", label: "Toate" },
  { key: "4", label: "4.0+" },
  { key: "4.5", label: "4.5+" },
];

/** A labeled filter group with an optional trailing value + a bottom divider. */
function Section({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-3 border-b-hairline border-border py-4">
      <View className="flex-row items-center justify-between">
        <Text className="font-title text-sm text-foreground">{label}</Text>
        {value ? (
          <Text className="font-semi text-xs text-muted-foreground">{value}</Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/**
 * Bottom-sheet of spot filters. Edits are applied live to the parent's
 * {@link SpotFilters} (the map updates behind the sheet); the primary button
 * just closes and shows how many spots currently match.
 */
export function SpotFilterSheet({
  open,
  onClose,
  filters,
  onChange,
  onReset,
  resultCount,
  hasLocation,
}: {
  open: boolean;
  onClose: () => void;
  filters: SpotFilters;
  onChange: (next: SpotFilters) => void;
  onReset: () => void;
  resultCount: number;
  hasLocation: boolean;
}) {
  const { height } = useWindowDimensions();
  const set = (patch: Partial<SpotFilters>) => onChange({ ...filters, ...patch });

  const kindValue: "all" | SpotKind =
    filters.kinds.length === 1 ? filters.kinds[0] : "all";

  const sliderDistance = filters.maxDistance ?? DISTANCE_MAX;

  return (
    <BottomSheet open={open} onClose={onClose} title="Filtre">
      <ScrollView
        style={{ maxHeight: height * 0.58 }}
        showsVerticalScrollIndicator={false}
      >
        <Section label="Tip loc">
          <Segmented
            options={KIND_OPTIONS}
            value={kindValue}
            onChange={(k) => set({ kinds: k === "all" ? [] : [k] })}
          />
        </Section>

        <Section label="Distanță" value={distanceLabel(filters.maxDistance)}>
          <IntervalSlider
            value={sliderDistance}
            onChange={(v) => set({ maxDistance: v >= DISTANCE_MAX ? null : v })}
            min={DISTANCE_MIN}
            max={DISTANCE_MAX}
            step={DISTANCE_STEP}
            minLabel={formatDistance(DISTANCE_MIN)}
            maxLabel="5+ km"
          />
          {!hasLocation ? (
            <View className="flex-row items-center gap-1.5">
              <MapPin size={13} color={palette.mutedForeground} />
              <Text className="font-mid text-[11px] text-muted-foreground">
                Activează localizarea pentru filtrarea după distanță.
              </Text>
            </View>
          ) : null}
        </Section>

        <Section label="Preț" value={priceLabel(filters.priceRange)}>
          <RangeSlider
            low={filters.priceRange[0]}
            high={filters.priceRange[1]}
            onChange={(lo, hi) => set({ priceRange: [lo, hi] })}
            min={PRICE_MIN}
            max={PRICE_MAX}
            step={PRICE_STEP}
            minLabel="Gratuit"
            maxLabel="20+ lei"
          />
        </Section>

        <Section label="Rating minim">
          <Segmented
            options={RATING_SEGMENTS}
            value={String(filters.minRating)}
            onChange={(k) => set({ minRating: Number(k) })}
          />
        </Section>
      </ScrollView>

      <View className="mt-5 flex-row gap-3">
        <Button
          variant="secondary"
          label="Resetează"
          className="flex-1"
          onPress={() => {
            haptics.selection();
            onReset();
          }}
        />
        <Button
          label={`Vezi ${spotCountLabel(resultCount)}`}
          className="flex-[1.4]"
          onPress={onClose}
        />
      </View>
    </BottomSheet>
  );
}
