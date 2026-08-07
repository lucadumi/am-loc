import { ArrowRight, Footprints, MapPin, Star } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { SpotImage } from "@/components/spot-image";
import { StatusBadge } from "@/components/status-badge";
import { palette } from "@/constants/theme";
import { formatPrice } from "@/lib/geo";
import { spotName } from "@/lib/spot-name";
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
  spot: ParkingSpot & { walkMin?: number };
  onPress?: () => void;
  fullWidth?: boolean;
}) {
  return (
    <Pressable onPress={onPress} className={fullWidth ? "w-full" : "w-64"}>
      <Card className="overflow-hidden">
        <View className="relative">
          <SpotImage kind={spot.kind} className="h-32 w-full" />
          <View className="absolute left-2 top-2">
            <StatusBadge status={spot.status} dotOnly />
          </View>
          <View className="absolute right-2 top-2 rounded-full bg-foreground/85 px-2.5 py-1">
            <Text className="font-heavy text-xs text-primary">
              {formatPrice(spot.pricePerHour, spot.paid)}
            </Text>
          </View>
        </View>
        <View className="gap-2 p-3">
          <Text numberOfLines={1} className="font-title text-base text-foreground">
            {spotName(spot)}
          </Text>
          <View className="flex-row items-center gap-3">
            <View className="flex-1 flex-row items-center gap-1">
              {spot.walkMin ? (
                <>
                  <Footprints size={13} color={palette.indigo[600]} />
                  <Text className="font-semi text-xs text-foreground">
                    {spot.walkMin} min
                  </Text>
                  {spot.area ? (
                    <Text className="font-mid text-xs text-muted-foreground">
                      ·
                    </Text>
                  ) : null}
                </>
              ) : spot.area ? (
                <MapPin size={13} color={palette.indigo[600]} />
              ) : null}
              {/* Absent on every imported car park, so an unconditional line
                  left a stray marker over blank space on each of them. */}
              {spot.area ? (
                <Text
                  numberOfLines={1}
                  className="flex-1 font-mid text-xs text-muted-foreground"
                >
                  {spot.area}
                </Text>
              ) : null}
            </View>
            {spot.rating ? (
              <View className="flex-row items-center gap-1">
                <Star size={13} color={palette.primary} fill={palette.primary} />
                <Text className="font-semi text-xs text-foreground">
                  {spot.rating.toFixed(1)}
                </Text>
              </View>
            ) : null}
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
