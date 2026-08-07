import { Screen } from "@/components/ui/screen";
import { Spinner } from "@/components/ui/spinner";

/**
 * A whole screen, waiting.
 *
 * Every loading state in the app was drawn slightly differently before this:
 * a wheel in a padded box on the home screen, a bare one on the detail screen,
 * a card floating over the map. Three spellings of "not yet", which is the
 * thing this codebase keeps having to fix.
 *
 * `bleed` because there is nothing here to keep clear of the status bar, and
 * the canvas should reach the top of the screen exactly as it does on the page
 * that is about to replace it. That is the whole trick to a loading state that
 * does not flash: it is already the shape of what comes next.
 */
export function LoadingScreen({ size = 56 }: { size?: number }) {
  return (
    <Screen bleed className="items-center justify-center">
      <Spinner size={size} />
    </Screen>
  );
}
