/**
 * Searching for a destination, and the parking around it.
 *
 * The two halves of #14 that are not the ranking: what the driver types, and
 * the list that comes back. Kept out of the map screen because they are the
 * part most likely to be redesigned -- the presentation was chosen from three
 * options and may well be swapped -- while `lib/geocode.ts` and `rankNearby`
 * underneath are not.
 *
 * NOTHING HERE FETCHES. The screen owns the query and the results; this file
 * owns how they look. That is what makes the map-with-a-sheet arrangement
 * replaceable by a plain list without touching the search itself.
 */

import { ArrowLeft, MapPin, Search, X } from "lucide-react-native";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";

import { SpotCard } from "@/components/spot-card";
import { fieldSurface } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { palette, shadow } from "@/constants/theme";
import { GEOCODER_ATTRIBUTION, type Place } from "@/lib/geocode";
import { cn } from "@/lib/utils";
import type { ParkingSpot } from "@/types";

/** The field, while the driver is typing. Sits where the search bar was. */
export function DestinationField({
  value,
  onChange,
  onCancel,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  onCancel: () => void;
  autoFocus?: boolean;
}) {
  return (
    <View className="flex-row items-center gap-2">
      {/* White and raised, not the grey it was: with the yellow band gone this
          sits directly over the map, where a secondary fill reads as part of
          the city rather than as a control. The same surface and shadow the
          field beside it carries. */}
      <Pressable
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Înapoi"
        hitSlop={8}
        style={shadow.card}
        className="h-12 w-12 items-center justify-center rounded-full border-hairline border-border bg-card"
      >
        <ArrowLeft size={20} color={palette.foreground} />
      </Pressable>

      <View className={cn(fieldSurface, "flex-1 border-primary")}>
        <Search size={20} color={palette.primary} />
        <TextInput
          value={value}
          onChangeText={onChange}
          autoFocus={autoFocus}
          placeholder="Unde vrei să mergi?"
          placeholderTextColor={palette.mutedForeground}
          returnKeyType="search"
          className="flex-1 font-sans text-foreground"
          style={{ fontSize: 16 }}
          accessibilityLabel="Destinația"
        />
        {value ? (
          <Pressable
            onPress={() => onChange("")}
            accessibilityRole="button"
            accessibilityLabel="Șterge"
            hitSlop={8}
          >
            <X size={18} color={palette.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The destination, once chosen, as the sheet's header.
 *
 * Tapping it reopens the search. A separate "change" control would be a second
 * thing to find; the name of the place you searched for is the obvious thing to
 * press when it is the wrong place.
 */
export function DestinationHeader({
  place,
  count,
  onPress,
  onClear,
}: {
  place: Place;
  count: number;
  onPress: () => void;
  onClear: () => void;
}) {
  return (
    <View className="flex-row items-center gap-3 px-5 pb-4">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Schimbă destinația, acum ${place.name}`}
        className="flex-1 flex-row items-center gap-2.5"
      >
        <MapPin size={18} color={palette.coral} strokeWidth={2.4} />
        <View className="flex-1">
          <Text numberOfLines={1} className="font-title text-base text-foreground">
            {place.name}
          </Text>
          <Text className="font-mid text-xs text-muted-foreground">
            {count === 1 ? "1 parcare în apropiere" : `${count} parcări în apropiere`}
          </Text>
        </View>
      </Pressable>

      <Pressable
        onPress={onClear}
        accessibilityRole="button"
        accessibilityLabel="Renunță la destinație"
        hitSlop={8}
        className="h-9 w-9 items-center justify-center rounded-full bg-secondary"
      >
        <X size={18} color={palette.foreground} />
      </Pressable>
    </View>
  );
}

/** One place the driver might mean. */
function Suggestion({ place, onPress }: { place: Place; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center gap-3 px-5 py-3.5"
    >
      <View className="h-9 w-9 items-center justify-center rounded-full bg-secondary">
        <MapPin size={17} color={palette.coral} strokeWidth={2.2} />
      </View>
      <View className="flex-1">
        <Text numberOfLines={1} className="font-semi text-sm text-foreground">
          {place.name}
        </Text>
        {place.detail ? (
          <Text numberOfLines={1} className="font-mid text-xs text-muted-foreground">
            {place.detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * What drops out of the search bar while the driver is typing.
 *
 * A panel over the map rather than a sheet rising from the bottom, because the
 * question and its answers belong together: the field is at the top, so the
 * addresses that might match it hang directly beneath. The parking found around
 * whichever one is chosen is a different question and stays in the sheet at the
 * bottom, which leaves the middle of the map -- and the destination pin in it --
 * visible between the two.
 *
 * Four states, and they are worth keeping distinct. An empty field is not a
 * failed search, a two-letter query is not a place that does not exist, and a
 * network that refused is not an empty city -- collapsing any of those into
 * "nimic găsit" tells the driver to give up on a question the app never asked.
 */
export function SuggestionList({
  query,
  places,
  loading,
  error,
  onPick,
}: {
  query: string;
  places: Place[];
  loading: boolean;
  error: string | null;
  onPick: (place: Place) => void;
}) {
  if (error) {
    return <Hint>{error}</Hint>;
  }
  /* Nothing, rather than an instruction. An empty field over a map is already
     self-explanatory, and a panel that opens to tell the driver to type is a
     panel in the way of the city they are looking at. `hasSuggestions` lets the
     screen skip drawing the card at all. */
  if (!query.trim()) return null;
  if (loading) {
    return (
      <View className="flex-row items-center gap-2.5 px-5 py-6">
        <ActivityIndicator size="small" color={palette.mutedForeground} />
        <Text className="font-mid text-sm text-muted-foreground">Caut…</Text>
      </View>
    );
  }
  if (!places.length) {
    return <Hint>Niciun rezultat pentru „{query.trim()}”.</Hint>;
  }

  return (
    <View className="py-1">
      {places.map((place) => (
        <Suggestion key={place.id} place={place} onPress={() => onPick(place)} />
      ))}
      <Text className="px-5 pb-2 pt-1 font-mid text-[11px] text-muted-foreground">
        {GEOCODER_ATTRIBUTION}
      </Text>
    </View>
  );
}

/** Whether the suggestion panel has anything in it worth opening for. */
export function hasSuggestions({
  query,
  places,
  loading,
  error,
}: {
  query: string;
  places: Place[];
  loading: boolean;
  error: string | null;
}): boolean {
  if (error) return true;
  if (!query.trim()) return false;
  return loading || places.length > 0 || query.trim().length > 0;
}

/** The ranked parking, once a destination is settled. */
export function ResultList({
  spots,
  onPick,
}: {
  spots: (ParkingSpot & { walkMin?: number })[];
  onPick: (spot: ParkingSpot) => void;
}) {
  if (!spots.length) {
    return <Hint>Nicio parcare la mai puțin de un sfert de oră pe jos.</Hint>;
  }
  return (
    <View className="gap-2.5 px-5 pb-4">
      {spots.map((spot) => (
        <SpotCard key={spot.id} spot={spot} compact onPress={() => onPick(spot)} />
      ))}
    </View>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <Text className="px-5 py-6 font-mid text-sm text-muted-foreground">
      {children}
    </Text>
  );
}
