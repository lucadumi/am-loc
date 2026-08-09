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
import { ParkingSpot } from "@/types";

/**
 * One spot, as a card.
 *
 * Three densities, one component, for the reason the two widths already shared:
 * a second way to draw a parking place is a second thing to keep in step, and
 * the day they disagree is the day a driver sees one price on the map and
 * another on the card.
 *
 * `fullWidth` is the vertical list on the "see all" page; the default fixed
 * width is what makes the home carousel scroll with a consistent rhythm.
 *
 * `compact` is for the sheet over the map, where the constraint is arithmetic
 * rather than taste. At its half-height stop the sheet has about 290px of list,
 * and the full card is 273 of them -- one result, in a list whose entire job is
 * to be compared. Dropping the image and the button brings it to roughly 90 and
 * shows three. The image is no loss: `SpotImage` draws the same grey panel for
 * every one of them, because no car park in either registry has a photograph.
 */
export function SpotCard({
  spot,
  onPress,
  fullWidth,
  compact,
}: {
  /**
   * A public spot carries no status, so it gets no badge: the app knows where
   * this car park is and what it charges, and nothing about whether there is
   * room in it. Only an owner's declaration fills the corner.
   */
  spot: ParkingSpot & { walkMin?: number };
  onPress?: () => void;
  fullWidth?: boolean;
  /** No image and no button: a row to compare rather than a card to admire. */
  compact?: boolean;
}) {
  if (compact) return <CompactCard spot={spot} onPress={onPress} />;

  return (
    <Pressable onPress={onPress} className={fullWidth ? "w-full" : "w-64"}>
      <Card className="overflow-hidden">
        <View className="relative">
          <SpotImage kind={spot.kind} className="h-32 w-full" />
          {spot.status ? (
            <View className="absolute left-2 top-2">
              <StatusBadge status={spot.status} dotOnly />
            </View>
          ) : null}
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

/**
 * The same spot, as a row.
 *
 * Everything the full card says except the two things that cost height and
 * carry nothing: the placeholder image, and a button that repeats what tapping
 * the row already does.
 *
 * The price moves from a pill over the image to the right-hand end of the top
 * line, where a column of them reads down the list -- which is the comparison
 * this density exists to make possible.
 */
function CompactCard({
  spot,
  onPress,
}: {
  spot: ParkingSpot & { walkMin?: number };
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="w-full">
      <Card className="flex-row items-center gap-3 px-3.5 py-3">
        <View className="flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            <Text
              numberOfLines={1}
              className="flex-1 font-title text-base text-foreground"
            >
              {spotName(spot)}
            </Text>
            {spot.status ? <StatusBadge status={spot.status} dotOnly /> : null}
          </View>

          <View className="flex-row items-center gap-3">
            {spot.walkMin ? (
              <IconRow
                icon={<Footprints size={13} color={palette.indigo[600]} />}
                textClassName="font-semi text-foreground"
              >
                {`${spot.walkMin} min`}
              </IconRow>
            ) : null}
            {spot.area ? (
              <IconRow
                truncate
                icon={<MapPin size={13} color={palette.coral} strokeWidth={2.2} />}
              >
                {spot.area}
              </IconRow>
            ) : null}
          </View>
        </View>

        {/* A column of its own rather than the end of the title line, centred
            against both rows. The price is what a list like this is read for,
            and sharing a line with a name that truncates put it at a different
            height on every card -- so the one thing a driver is scanning down
            the list for was the one thing that would not line up. */}
        <Text className="font-heavy text-sm text-foreground">
          {formatPrice(spot.pricePerHour, spot.paid)}
        </Text>

        <View className="h-9 w-9 items-center justify-center rounded-full bg-primary">
          <ArrowRight size={18} color="#FFFFFF" />
        </View>
      </Card>
    </Pressable>
  );
}
