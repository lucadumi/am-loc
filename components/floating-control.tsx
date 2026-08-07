import { IconButton } from "@/components/ui/icon-button";

/**
 * A control floating over the map.
 *
 * Kept as its own name rather than deleted, because the map screen reads
 * better for it and because "floating over a map" is a place in the app, not a
 * size. What it no longer does is spell the surface out for itself: that lives
 * in `IconButton`, so the four other round buttons in the app cannot drift
 * away from this one.
 */
export function FloatingControl({
  children,
  onPress,
  className,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  className?: string;
}) {
  return (
    <IconButton onPress={onPress} className={className}>
      {children}
    </IconButton>
  );
}
