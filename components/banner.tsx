import { ArrowRight } from "lucide-react-native";
import { Image, Pressable, View, type ImageSourcePropType } from "react-native";

import { Text } from "@/components/ui/text";
import { palette, scrim } from "@/constants/theme";
import { cn } from "@/lib/utils";

/**
 * A full-bleed photograph with one sentence over it and a way in.
 *
 * The home screen had this written out by hand -- an `Image`, an absolute
 * scrim, an absolute row, a yellow disc with an arrow in it -- which was fine
 * while there was one. There are two now, and the parts most easily got wrong
 * are the ones nobody would think to check: the scrim is a *named* level
 * (`scrim.overlay`) rather than an opacity somebody picked, because white text
 * on an unknown photograph is a contrast promise; and the arrow's disc is the
 * same 44px circle the rest of the app uses for a primary round control.
 *
 * FULL BLEED, WITHOUT A RADIUS, and that is the point of it rather than an
 * omission. Everything else on these screens is an inset card with a hairline
 * border, so a banner that ran edge to edge is the one element that reads as
 * the page itself speaking rather than as another row in a list. Insetting it
 * would make it a fourth card and it would stop being noticed.
 */
export function Banner({
  image,
  label,
  onPress,
  className,
}: {
  image: ImageSourcePropType;
  /** One line. Two wrap into the arrow and stop being a headline. */
  label: string;
  onPress: () => void;
  className?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={cn("active:opacity-90", className)}
    >
      <Image
        source={image}
        style={{ width: "100%", height: 110 }}
        resizeMode="cover"
      />
      <View
        className="absolute inset-0"
        style={{ backgroundColor: scrim.overlay }}
      />
      <View className="absolute inset-0 flex-row items-center px-5">
        <Text className="flex-1 font-title text-lg leading-tight text-white">
          {label}
        </Text>
        <View className="ml-4 h-11 w-11 items-center justify-center rounded-full bg-primary">
          <ArrowRight size={22} color={palette.primaryForeground} />
        </View>
      </View>
    </Pressable>
  );
}
