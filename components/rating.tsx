/**
 * A car park's score, including the honest zero.
 *
 * Nothing rates a car park in Bucharest. Neither CMPB nor OpenStreetMap
 * records a score, so `rating` is absent on all 838 imported places and will
 * stay absent until drivers give them one.
 *
 * Which leaves two ways to draw it, and hiding it was the wrong one. A star
 * that appears only once a place has been rated is invisible on every screen
 * in the app today, so nobody discovers that rating is a thing the app does --
 * and the first driver willing to leave one never finds where. Drawing an empty
 * star says both true things at once: nobody has rated this, and rating it is
 * possible.
 *
 * The star keeps the brand yellow in both states and changes only its fill.
 * That is what makes the empty state read as "not yet" rather than as a bad
 * score: a filled yellow star reading "0.0" is a verdict, and would be one
 * passed on eight hundred car parks nobody has complained about.
 */

import { Star } from "lucide-react-native";
import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { palette } from "@/constants/theme";

export function Rating({
  value,
  size = 13,
}: {
  /** The score, or undefined where nobody has given one. */
  value?: number;
  size?: number;
}) {
  const rated = value != null && value > 0;

  return (
    <View className="flex-row items-center gap-1">
      {/* Yellow either way, filled only once it has been earned. The outline
          keeps the star recognisable as the same control a driver will later
          tap, while the hollow centre says plainly that nobody has rated this
          yet -- where a filled yellow star reading "0.0" would be a score, and
          a bad one, libelling eight hundred car parks nobody has complained
          about. */}
      <Star
        size={size}
        color={palette.primary}
        fill={rated ? palette.primary : "transparent"}
        strokeWidth={rated ? 2 : 2.2}
        style={{ flexShrink: 0 }}
      />
      <Text
        className={
          rated
            ? "font-semi text-xs text-foreground"
            : "font-mid text-xs text-muted-foreground"
        }
      >
        {rated ? value.toFixed(1) : "0"}
      </Text>
    </View>
  );
}
