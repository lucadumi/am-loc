import Svg, { Path } from "react-native-svg";

import { useColors } from "@/hooks/use-theme";

/**
 * A traffic cone, for the screens that are not built yet.
 *
 * Replaces the `Construction` glyph from the icon set, which is a line drawing
 * of a road sign and read at a glance as a warning that something was wrong.
 * A cone says the same thing more kindly: work is happening here, come back.
 *
 * Traced into `react-native-svg` rather than shipped as an `.svg`, for the
 * same reason as `Spinner`: React Native has no SVG loader without a Metro
 * transformer.
 *
 * Artwork (c) loading.io, CC-BY.
 */
export function Cone({
  size = 44,
  /* Defaulted in the body rather than here: a parameter default is evaluated
     where a hook cannot be called, and a theme read at module load is the one
     the app started in. */
  color,
  stripe,
}: {
  size?: number;
  /** The cone itself. The brand yellow unless told otherwise. */
  color?: string;
  /** The reflective bands. */
  stripe?: string;
}) {
  const colors = useColors();
  const fill = color ?? colors.primary;
  const bands = stripe ?? colors.card;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M79 80.5h-7.4L57.2 15.8c-.7-3.4-3.7-5.8-7.2-5.8s-6.5 2.4-7.2 5.8L28.4 80.5H21c-2.2 0-4 1.8-4 4V86c0 2.2 1.8 4 4 4h58c2.2 0 4-1.8 4-4v-1.5c0-2.2-1.8-4-4-4z" fill={fill} />
      <Path d="M73 86.7l-2.5-11.5h-41L27 86.7z" fill={fill} />
      <Path d="M59.2 24.8H40.8l-2.3 10.4h23z" fill={bands} />
      <Path d="M63.7 44.8H36.3L34 55.2h32z" fill={bands} />
      <Path d="M68.1 64.8H31.9l-2.4 10.4h41z" fill={bands} />
    </Svg>
  );
}
