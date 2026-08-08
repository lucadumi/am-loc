import { ArrowRight, Footprints, MapPin } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Rating } from "@/components/rating";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconRow } from "@/components/ui/icon-row";
import { Text } from "@/components/ui/text";
import { SpotImage } from "@/components/spot-image";
import { StatusBadge } from "@/components/status-badge";
import { palette } from "@/constants/theme";
import { formatPrice } from "@/lib/geo";
import { spotName } from "@/lib/spot-name";
import type { ConfidenceLevel } from "@/lib/spot-state";
import { ParkingSpot } from "@/types";

/**
 * One spot, as a card.
 *
 * `fullWidth` is for the vertical list on the "see all" page; the default fixed
 * width is what makes the home carousel scroll horizontally with a consistent
 * rhythm. Same card either way, so the two screens cannot drift apart.
 */
export function SpotCard({
  spot,
  onPress,
  fullWidth,
}: {
  /**
   * `confidenceLevel` is optional because a bare `ParkingSpot` has none, but
   * every screen that draws this card runs its spots through `believeAll`
   * first, so in practice it is always there. It has to reach the dot: a spot
   * nobody has reported on is flattened to `taken`, and drawn as a solid red
   * dot that becomes a claim the app cannot support -- 838 of the 851 imported
   * car parks are in exactly that position.
   */
  spot: ParkingSpot & { walkMin?: number; confidenceLevel?: ConfidenceLevel };
  onPress?: () => void;
  fullWidth?: boolean;
}) {
  return (
    <Pressable onPress={onPress} className={fullWidth ? "w-full" : "w-64"}>
      <Card className="overflow-hidden">
        <View className="relative">
          <SpotImage kind={spot.kind} className="h-32 w-full" />
          <View className="absolute left-2 top-2">
            <StatusBadge
              status={spot.status}
              unknown={spot.confidenceLevel === "none"}
              dotOnly
            />
          </View>
          {/* The price, over the placeholder panel rather than in the body, so
              a driver comparing cards reads what each one costs without
              looking down.

              The text darkens as the background lightens, and the pair has to
              move together. `SpotImage` always draws the same light grey panel
              (#E4E4E7 — no car park in either registry carries a photograph),
              so a 15% pill lands on a pale grey where the foreground colour is
              10.3:1 and the brand yellow would be under 1.5:1: legible only
              because the text went dark when the fill went light. */}
          <View className="absolute right-2 top-2 rounded-full bg-foreground/15 px-2.5 py-1">
            <Text className="font-heavy text-xs text-foreground">
              {formatPrice(spot.pricePerHour, spot.paid)}
            </Text>
          </View>
        </View>
        <View className="gap-2 p-3">
          <Text numberOfLines={1} className="font-title text-base text-foreground">
            {spotName(spot)}
          </Text>

          {/* Where it is, on its own line.

              It shared a line with the walk time until the areas arrived, and
              could not keep doing so: "Sector 1 · Piața Dorobanților" is 29
              characters against the ~21 that were left beside a walk time and a
              score, so the pin and the text were competing for room with two
              other things and losing. A row of its own is also the honest
              layout -- this is the answer to "where is it", which is a
              different question from "how far is it". */}
          {spot.area ? (
            <IconRow
              truncate
              icon={
                <MapPin size={13} color={palette.coral} strokeWidth={2.2} />
              }
            >
              {spot.area}
            </IconRow>
          ) : null}

          <View className="flex-row items-center justify-between gap-3">
            {spot.walkMin ? (
              <IconRow
                icon={<Footprints size={13} color={palette.indigo[600]} />}
                textClassName="font-semi text-foreground"
              >
                {`${spot.walkMin} min pe jos`}
              </IconRow>
            ) : (
              <View />
            )}
            <Rating value={spot.rating} />
          </View>
          <Button
            size="sm"
            label="Vezi traseul"
            onPress={onPress}
            rightIcon={<ArrowRight size={16} color={palette.primaryForeground} />}
            className="mt-1"
          />
        </View>
      </Card>
    </Pressable>
  );
}
