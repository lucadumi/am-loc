import { MapPin, Search } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useColors } from "@/hooks/use-theme";
import {
  GEOCODER_ATTRIBUTION,
  searchPlaces,
  type Place,
} from "@/lib/geocode";
import { haptics } from "@/lib/haptics";

/**
 * Marking the place of a report without touching the map.
 *
 * The map is the good way to do this and is unusable by a screen reader: a
 * marker at a coordinate is not something a reader's cursor can land on, and
 * dragging it is the gesture the reader has taken for its own navigation. The
 * map's tap-to-place already covers somebody who cannot drag but can see; this
 * covers somebody who cannot use the map at all.
 *
 * WHY AN ADDRESS AND NOT "USE MY LOCATION". Because the case that needs this
 * is precisely the case where the device's own fix is not good enough:
 * `mayFileAt` lets a GPS fix file on its own, so a driver with one is already
 * through. The person left standing is the one whose position came from an IP
 * lookup -- kilometres out -- and offering them a button that files at it
 * would be handing them the exact wrong answer with less effort. What they
 * know, and the app does not, is the name of the street.
 *
 * The geocoder is #14's, unchanged, including its attribution requirement --
 * OpenStreetMap's usage policy is a condition and not a courtesy, so the
 * credit is drawn wherever results are.
 */
export function PlaceBySearch({
  onPlaced,
}: {
  /** Called with the coordinates the driver chose. */
  onPlaced: (place: { latitude: number; longitude: number; label: string }) => void;
}) {
  const colors = useColors();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const abort = useRef<AbortController | null>(null);

  /* Abandoned on unmount rather than left to resolve into a component that is
     gone. Nominatim answers in its own time and this screen can be left. */
  useEffect(() => () => abort.current?.abort(), []);

  const run = () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;

    setSearching(true);
    setFailed(false);
    searchPlaces(query, controller.signal)
      .then((found) => {
        if (controller.signal.aborted) return;
        setResults(found);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setFailed(true);
        setResults(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearching(false);
      });
  };

  return (
    <View className="gap-3">
      <Input
        accent
        value={query}
        onChangeText={setQuery}
        placeholder="Strada și numărul"
        autoCapitalize="words"
        returnKeyType="search"
        onSubmitEditing={run}
        accessibilityLabel="Caută adresa blocajului"
      />

      {/* Searched on demand rather than as you type, and not only to be kind
          to a donated server: a reader announces a list that changes under it,
          so a result set rebuilt on every keystroke talks over the person
          typing. */}
      <Button
        size="sm"
        variant="secondary"
        label="Caută"
        loading={searching}
        disabled={query.trim().length < 3}
        onPress={run}
        rightIcon={<Search size={16} color={colors.foreground} />}
      />

      {searching ? (
        <View className="flex-row items-center gap-2 py-2">
          <ActivityIndicator size="small" color={colors.mutedForeground} />
          <Text className="font-mid text-sm text-muted-foreground">
            Se caută…
          </Text>
        </View>
      ) : null}

      {failed ? (
        <Text
          accessibilityRole="alert"
          className="font-mid text-sm leading-5 text-muted-foreground"
        >
          Căutarea nu a mers. Verifică semnalul și încearcă din nou.
        </Text>
      ) : null}

      {/* An empty result is said out loud rather than drawn as nothing. A list
          that silently fails to appear is indistinguishable, to a reader, from
          one that has not loaded yet. */}
      {results && !results.length && !searching ? (
        <Text
          accessibilityRole="alert"
          className="font-mid text-sm leading-5 text-muted-foreground"
        >
          Nicio adresă găsită. Încearcă doar numele străzii.
        </Text>
      ) : null}

      {results?.length ? (
        <View accessibilityRole="list" className="gap-2">
          {results.map((place) => (
            <Pressable
              key={place.id}
              accessibilityRole="button"
              accessibilityLabel={
                place.detail ? `${place.name}, ${place.detail}` : place.name
              }
              accessibilityHint="Marchează locul sesizării aici"
              onPress={() => {
                haptics.selection();
                onPlaced({
                  latitude: place.latitude,
                  longitude: place.longitude,
                  label: place.name,
                });
              }}
              className="flex-row items-center gap-3 rounded-lg border-hairline border-border bg-card p-3 active:opacity-70"
            >
              <MapPin size={18} color={colors.coral} />
              <View className="flex-1">
                <Text numberOfLines={1} className="font-title text-sm">
                  {place.name}
                </Text>
                {place.detail ? (
                  <Text
                    numberOfLines={1}
                    className="font-mid text-xs text-muted-foreground"
                  >
                    {place.detail}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
          {/* Required by OpenStreetMap's usage policy wherever results show. */}
          <Text className="font-mid text-[11px] text-muted-foreground">
            {GEOCODER_ATTRIBUTION}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
