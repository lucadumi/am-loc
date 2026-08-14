import type { ComponentProps } from "react";

import { IconButton } from "@/components/ui/icon-button";

/**
 * A control floating over the map.
 *
 * Kept as its own name rather than deleted, because the map screen reads
 * better for it and because "floating over a map" is a place in the app, not a
 * size. What it no longer does is spell the surface out for itself: that lives
 * in `IconButton`, so the four other round buttons in the app cannot drift
 * away from this one.
 *
 * Everything else is forwarded rather than enumerated. Naming three props was
 * enough while the only questions were what it draws and what it does, and it
 * quietly made the control impossible to label: `accessibilityLabel` was
 * dropped on the floor, so the map's zoom and recentre buttons announced
 * themselves to a reader as "button", three times, with nothing to tell them
 * apart.
 */
export function FloatingControl(props: ComponentProps<typeof IconButton>) {
  return <IconButton {...props} />;
}
