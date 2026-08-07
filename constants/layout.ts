/**
 * Layout constants for the floating tab bar. The bar overlays the page
 * (absolute positioning), so any scrolling or bottom-anchored content must
 * leave room for it instead of relying on reserved navigator space.
 */

/** Visual height of the floating pill (tallest child = the center "+"). */
const FLOATING_TAB_BAR_PILL_HEIGHT = 68;

/** Transparent gap above the pill (the wrapper's `pt-3`). */
const FLOATING_TAB_BAR_TOP_GAP = 12;

/**
 * Space the floating tab bar occupies from the bottom of the screen, including
 * its safe-area inset. Add it as bottom padding on scrolling screens, or use it
 * to lift bottom-anchored overlays (e.g. the map spot sheet) above the pill.
 */
export function floatingTabBarInset(bottomInset: number): number {
  return (
    Math.max(bottomInset, 16) +
    FLOATING_TAB_BAR_PILL_HEIGHT +
    FLOATING_TAB_BAR_TOP_GAP
  );
}
