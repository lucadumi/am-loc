import {
  MapPin,
  Minus,
  Navigation,
  Plus,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import Animated, { FadeIn, FadeInUp, FadeOutUp } from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { FloatingControl } from "@/components/floating-control";
import { SearchBar } from "@/components/search-bar";
import {
  DestinationField,
  DestinationHeader,
  hasSuggestions,
  ResultList,
  SuggestionList,
} from "@/components/destination-search";
import { MapSheet } from "@/components/map-sheet";
import { SpotFilterSheet } from "@/components/spot-filter-sheet";
import { IconButton } from "@/components/ui/icon-button";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { shadow, type Palette } from "@/constants/theme";
import { useColors, useStatusColors, useTheme } from "@/hooks/use-theme";
import { useCurrentLocation } from "@/hooks/use-current-location";
import { useLive } from "@/hooks/use-live";
import { getReports, getSpots, rankNearby } from "@/lib/api";
import { withOffers, type OfferedSpot } from "@/lib/private-spots";
import {
  DEFAULT_FILTERS,
  countActiveFilters,
  filterSpots,
  spotCountLabel,
} from "@/lib/filters";
import { floatingTabBarInset } from "@/constants/layout";
import { BUCHAREST } from "@/lib/geo";
import { GeocodeError, searchPlaces, type Place } from "@/lib/geocode";
import { BlockerReport, SpotFilters } from "@/types";
import type { SpotStatus } from "@/types";

/** Square button beside the search bar; a yellow badge shows the active count. */
function FilterButton({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <IconButton
      size="lg"
      onPress={onPress}
      accessibilityLabel="Filtre"
      style={shadow.card}
    >
      <SlidersHorizontal size={22} color={colors.foreground} />
      {count > 0 ? (
        <View className="absolute -right-1 -top-1 h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1">
          <Text className="font-heavy text-[11px] text-primary-foreground">
            {count}
          </Text>
        </View>
      ) : null}
    </IconButton>
  );
}

/**
 * What colour a pin is, which is a question about who is entitled to speak.
 *
 * A private spot has an owner who decides, so its pin carries their answer. A
 * public one has nobody: the app knows where it is, how big it is and what it
 * charges, and nothing whatever about whether there is room in it now. Drawing
 * those in a status colour would be a hundred confident claims nobody made, so
 * they are grey and hollow -- which is the true statement.
 */
function pinColor(
  spot: OfferedSpot,
  colors: Palette,
  statusColor: Record<SpotStatus, string>,
): string {
  return spot.status ? statusColor[spot.status] : colors.mutedForeground;
}

/**
 * Where the sheet rests, as fractions of the screen.
 *
 * Two stops rather than three. The third would be a "get out of the way" state,
 * and this tab is already a map with no list on it -- a driver who wants the
 * city rather than the results closes the search. Written as an array so that
 * conclusion costs one number to reverse rather than a rewrite of the gesture.
 */
const SHEET_STOPS = [0.45, 0.88];

/** How far from the destination is still worth walking. */
const SEARCH_RADIUS_M = 1200;

/** How long to wait for the typing to stop before spending a request. */
const TYPING_SETTLE_MS = 350;

/** Nobody has standing to say whether this one is free. */
function unreliable(spot: OfferedSpot): boolean {
  return !spot.status;
}

export default function MapScreen() {
  const colors = useColors();
  const theme = useTheme();
  const statusColor = useStatusColors();
  const mapRef = useRef<MapView>(null);
  const router = useRouter();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const location = useCurrentLocation();
  /* Arriving from a report: where to fly, and which pin to ring. Flown once
     per set of coordinates rather than on every focus, so coming back to the
     tab later leaves the map where the driver left it. */
  const { lat, lng, focus, search } = useLocalSearchParams<{
    lat?: string;
    lng?: string;
    focus?: string;
    /** A nonce from the home screen's search bar; its value is never read. */
    search?: string;
  }>();
  const flownTo = useRef<string | null>(null);
  const [spots, setSpots] = useState<OfferedSpot[]>([]);
  const [reports, setReports] = useState<BlockerReport[]>([]);
  const [filters, setFilters] = useState<SpotFilters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  /**
   * Whether the first load has landed.
   *
   * Only the first: `load` also runs on every focus and on every claim anybody
   * files anywhere, and a spinner over the map each time somebody two streets
   * away announced a space would be worse than no spinner at all. After this
   * is true the map updates in place, which is what a live map should look
   * like.
   */
  const [ready, setReady] = useState(false);

  /* The search, as three separate things rather than one "mode" enum. They are
     genuinely independent: a driver can reopen the field over an existing
     destination and change their mind, which has to leave the old destination
     standing until a new one is picked. */
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [destination, setDestination] = useState<Place | null>(null);
  /* What the sheet is showing, which outlives `destination` by one animation:
     clearing it has to leave something on screen to slide away, or the sheet
     would vanish mid-gesture. */
  const [sheetPlace, setSheetPlace] = useState<Place | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [seeking, setSeeking] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  /** Which stop the sheet rests at. Searching always wants the tall one. */
  const [sheetIndex, setSheetIndex] = useState(SHEET_STOPS.length - 1);

  const load = useCallback(() => {
    getSpots()
      .then((loaded) => withOffers(loaded))
      .then(setSpots)
      .catch((error) => console.error("Could not load spots", error))
      // Settled rather than fulfilled: a failed load has finished loading, and
      // leaving the wheel turning over a map that is never going to fill would
      // be the one state that tells the driver nothing at all.
      .finally(() => setReady(true));
    getReports()
      .then(setReports)
      .catch((error) => console.error("Could not load reports", error));
  }, []);

  /* On focus rather than on mount: a tab screen mounts once and then stays
     mounted, so a spot announced from the Adaugă tab would be missing from
     the map until the app was restarted. Reloading on focus also re-ages every
     belief, which is the difference between a live map and a screenshot of one
     taken whenever the tab first opened. */
  useFocusEffect(load);

  /* And again whenever anybody, anywhere, says something about a kerb. This is
     the screen the claim about the map being live is made on, and a driver
     staring at it while a space opens two streets away should not have to
     leave the tab and come back to find out. */
  useLive("spots", load);
  useLive("reports", load);

  useFocusEffect(
    useCallback(() => {
      if (!lat || !lng) return;
      const latitude = Number(lat);
      const longitude = Number(lng);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      const key = `${lat},${lng}`;
      if (flownTo.current === key) return;
      flownTo.current = key;
      // Close enough to pick the pin out, wide enough to keep its neighbours
      // on screen: flying in tighter than the spots are spread apart empties
      // the map, which reads as the parking having vanished.
      const timer = setTimeout(
        () =>
          mapRef.current?.animateToRegion(
            {
              latitude,
              longitude,
              latitudeDelta: 0.014,
              longitudeDelta: 0.014,
            },
            600,
          ),
        250,
      );
      return () => clearTimeout(timer);
    }, [lat, lng]),
  );

  /* Debounced, aborted and rate-limited, in that order. Nominatim runs on
     donated hardware and asks for one request a second; `searchPlaces` enforces
     that itself, and this keeps the queue from filling up with keystrokes whose
     answers nobody will ever read. */
  useEffect(() => {
    if (!searching) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSeeking(true);
      setSearchError(null);
      searchPlaces(query, controller.signal)
        .then((found) => {
          if (!controller.signal.aborted) setPlaces(found);
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          console.error("Could not search for a destination", error);
          setSearchError(
            error instanceof GeocodeError && error.message
              ? error.message
              : "Nu am putut căuta acum.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setSeeking(false);
        });
    }, TYPING_SETTLE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, searching]);

  /* Arriving from the home screen's search bar. Keyed on the nonce rather than
     on its presence, because this tab stays mounted: without a changing value,
     a second tap would find the parameter unchanged and do nothing. */
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!search || openedFor.current === search) return;
    openedFor.current = search;
    setSearching(true);
  }, [search]);

  const activeCount = countActiveFilters(filters);
  const visibleSpots = useMemo(
    () =>
      filterSpots(
        spots,
        filters,
        location
          ? { latitude: location.latitude, longitude: location.longitude }
          : null,
      ),
    [spots, filters, location],
  );

  /* What the sheet lists, and what the map draws, are the same set on purpose.
     A list of twelve car parks over a map showing eight hundred pins would have
     the driver hunting for the one they just read about. */
  const ranked = useMemo(
    () =>
      destination
        ? rankNearby(visibleSpots, destination, { radiusM: SEARCH_RADIUS_M })
        : null,
    [visibleSpots, destination],
  );
  const pinned = ranked ?? visibleSpots;

  /* What the filter controls are counting. With a destination set, the honest
     number is what is actually on the map and in the sheet -- the whole city's
     total would not change when the driver tightened a filter they can see the
     effect of. */
  const shownCount = pinned.length;

  /**
   * How much of the map is hidden behind something, so the map can stop putting
   * pins there.
   *
   * `mapPadding` does not crop the map -- it tells it which rectangle is
   * actually being looked at, so centring, zooming and the region it flies to
   * all resolve inside the visible strip rather than behind the sheet. Without
   * it, flying to a destination puts it in the middle of the screen, which with
   * the sheet up is halfway underneath it.
   */
  const sheetShowing = !!destination && !searching;
  const mapPadding = useMemo(
    () => ({
      top: 0,
      right: 0,
      bottom: sheetShowing
        ? height * (SHEET_STOPS[sheetIndex] ?? SHEET_STOPS[0]) +
          floatingTabBarInset(insets.bottom)
        : 0,
      left: 0,
    }),
    [sheetShowing, sheetIndex, height, insets.bottom],
  );

  /* Both dependencies matter. Reopening the search hides the sheet, which drops
     its contents; backing out of the search has to put them back, and only
     `searching` changed. */
  useEffect(() => {
    if (destination && !searching) setSheetPlace(destination);
  }, [destination, searching]);

  /* Fly once per destination, after the render that applied the padding. */
  useEffect(() => {
    if (!destination) return;
    const timer = setTimeout(
      () =>
        mapRef.current?.animateToRegion(
          {
            latitude: destination.latitude,
            longitude: destination.longitude,
            latitudeDelta: 0.018,
            longitudeDelta: 0.018,
          },
          600,
        ),
      60,
    );
    return () => clearTimeout(timer);
  }, [destination]);

  const suggestionsOpen = hasSuggestions({
    query,
    places,
    loading: seeking,
    error: searchError,
  });

  const openSearch = () => {
    setSearching(true);
    setQuery("");
    setPlaces([]);
    setSearchError(null);
  };

  /* Backing out leaves whatever was already chosen alone. A driver who opens
     the field over an existing destination and changes their mind wants the old
     answer back, not an empty map. */
  const closeSearch = () => {
    setSearching(false);
    setQuery("");
    setPlaces([]);
  };

  const pickDestination = (place: Place) => {
    setDestination(place);
    setSearching(false);
    setQuery("");
    setPlaces([]);
    setSearchError(null);
    /* Down to the short stop, because the point of choosing a destination on a
       map is seeing where the answers are in relation to it. The flight itself
       is left to the effect below, so that it happens after `mapPadding` has
       been told the sheet is there -- flying first would centre the destination
       on the whole screen and then leave it behind the sheet. */
    setSheetIndex(0);
  };

  const clearDestination = () => {
    setDestination(null);
    setSearching(false);
    setQuery("");
    setPlaces([]);
  };

  const zoom = async (delta: number) => {
    const cam = await mapRef.current?.getCamera();
    if (!cam) return;
    if (cam.zoom != null) cam.zoom += delta;
    else if (cam.altitude != null) cam.altitude *= delta > 0 ? 0.5 : 2;
    mapRef.current?.animateCamera(cam, { duration: 250 });
  };

  const recenter = () =>
    mapRef.current?.animateToRegion(
      location
        ? {
            latitude: location.latitude,
            longitude: location.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }
        : BUCHAREST,
      350,
    );

  return (
    <View className="flex-1 bg-background">
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={{ flex: 1 }}
        initialRegion={BUCHAREST}
        userInterfaceStyle={theme}
        showsMyLocationButton={false}
        showsCompass={false}
        mapPadding={mapPadding}
      >
        {destination ? (
          /* Coral, and larger than a parking pin, because it is the one thing
             on the map that is not a parking place. `colors.coral` is already
             the app's "here is a location" colour -- see the note beside it in
             constants/theme.ts -- so a driver who has seen a spot card knows
             what this is without a legend. */
          <Marker
            key="destination"
            coordinate={{
              latitude: destination.latitude,
              longitude: destination.longitude,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={10}
          >
            <View className="items-center justify-center">
              <View
                className="h-11 w-11 items-center justify-center rounded-full border-[3px] border-background"
                style={{ backgroundColor: colors.coral, ...shadow.card }}
              >
                <MapPin size={20} color="#FFFFFF" strokeWidth={2.4} />
              </View>
            </View>
          </Marker>
        ) : null}

        {pinned.map((s) => (
          <Marker
            key={s.id}
            coordinate={{ latitude: s.latitude, longitude: s.longitude }}
            onPress={() =>
              router.push({ pathname: "/garage", params: { id: s.id } })
            }
            anchor={{ x: 0.5, y: 0.5 }}
          >
            {/* Same pin, hollowed when the claim is not worth acting on.
                The colour still says what was reported; the fill says whether
                anyone has confirmed it lately. Fading it instead would leave a
                stale free spot reading as green at a glance, which is the
                misreading this is here to prevent. */}
            <View
              className="h-9 w-9 items-center justify-center rounded-full border-2 border-background"
              style={
                unreliable(s)
                  ? { backgroundColor: colors.background, borderColor: pinColor(s, colors, statusColor) }
                  : { backgroundColor: pinColor(s, colors, statusColor) }
              }
            >
              <Text
                className="font-heavy text-sm"
                style={{
                  color: unreliable(s) ? pinColor(s, colors, statusColor) : colors.primaryForeground,
                }}
              >
                P
              </Text>
            </View>
          </Marker>
        ))}

        {reports.map((r) => {
          const ringed = r.id === focus;
          return (
            <Marker
              key={r.id}
              coordinate={{ latitude: r.latitude, longitude: r.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={ringed ? 10 : 1}
            >
              {/* The one arrived at from its report wears a brand ring, so a
                  driver who tapped a location lands on a pin they can find
                  among the others rather than on a red dot like every red
                  dot. */}
              <View
                className={
                  ringed
                    ? "h-11 w-11 items-center justify-center rounded-full border-4 border-primary"
                    : "h-8 w-8 items-center justify-center rounded-full border-2 border-background"
                }
                style={{ backgroundColor: colors.destructive }}
              >
                <TriangleAlert
                  size={ringed ? 20 : 16}
                  color={colors.primaryForeground}
                  strokeWidth={2.4}
                />
              </View>
            </Marker>
          );
        })}

        {location ? (
          <Marker
            coordinate={{
              latitude: location.latitude,
              longitude: location.longitude,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
            title="Locația ta"
            description={location.label}
          >
            <View style={{ backgroundColor: colors.accentSolid }}
              className="h-5 w-5 items-center justify-center rounded-full border-2 border-background">
              <View className="h-2 w-2 rounded-full bg-background" />
            </View>
          </Marker>
        ) : null}
      </MapView>

      {/* Over the map rather than instead of it: the map itself is useful
          while the pins are still coming, and replacing it with a blank
          loading screen would take the city away to say "wait". */}
      {!ready ? (
        <View
          pointerEvents="none"
          className="absolute inset-0 items-center justify-center"
        >
          <Spinner size={44} />
        </View>
      ) : null}

      {/* No band at all: these are controls floating over a city, and the city
          is the thing worth seeing. The brand colour moved to the search
          field's border, where it marks the one control being used rather than
          tinting the map behind it. */}
      <SafeAreaView
        edges={["top"]}
        className="absolute inset-x-0 top-0 px-5 pb-3 pt-2"
        pointerEvents="box-none"
      >
        {searching ? (
          <Animated.View entering={FadeIn.duration(140)}>
            <DestinationField
              value={query}
              onChange={setQuery}
              onCancel={closeSearch}
              autoFocus
            />
          </Animated.View>
        ) : (
          <Animated.View
            entering={FadeIn.duration(140)}
            className="flex-row items-center gap-3"
          >
            <SearchBar
              placeholder={destination ? destination.name : "Unde vrei să mergi?"}
              className="flex-1"
              accent
              style={shadow.card}
              onPress={openSearch}
            />
            <FilterButton count={activeCount} onPress={() => setFilterOpen(true)} />
          </Animated.View>
        )}

        {/* The answers, hanging off the field that asked for them. A card over
            the map rather than a sheet from the bottom: the question is at the
            top of the screen, so the addresses that might match it belong
            directly beneath, and the parking found around whichever is chosen
            stays in the sheet below -- which leaves the middle of the map, and
            the destination pin in it, visible between the two. */}
        {searching && suggestionsOpen ? (
          <Animated.View
            entering={FadeInUp.duration(160)}
            exiting={FadeOutUp.duration(120)}
            className="mt-3 overflow-hidden rounded-2xl bg-card"
            style={[shadow.card, { backgroundColor: colors.accentSolid }]}
          >
            {/* Sized against the screen rather than a constant. 320px was
                generous on a large phone and cut the fifth answer off on a
                small one, which reads as the app having found fewer places. */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: height * 0.42 }}
            >
              <SuggestionList
                query={query}
                places={places}
                loading={seeking}
                error={searchError}
                onPick={pickDestination}
              />
            </ScrollView>
          </Animated.View>
        ) : null}
        {/* Hidden while the dropdown is open: the panel covers it, and a count
            of results is not the question being asked at that moment. */}
        {activeCount > 0 && !searching ? (
          <Pressable
            onPress={() => setFilterOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`${spotCountLabel(shownCount)}, ${activeCount} filtre active`}
            accessibilityHint="Deschide filtrele"
            className="mt-3 flex-row items-center gap-2 self-start rounded-full px-3.5 py-1.5"
            style={[shadow.card, { backgroundColor: colors.accentSolid }]}
          >
            <Text className="font-heavy text-xs text-card">
              {spotCountLabel(shownCount)}
            </Text>
            <View className="h-1 w-1 rounded-full bg-white/60" />
            <Text className="font-semi text-xs text-card">Filtre active</Text>
          </Pressable>
        ) : null}
      </SafeAreaView>

      <View
        className="absolute bottom-40 right-5 gap-3"
        pointerEvents="box-none"
      >
        <FloatingControl onPress={() => zoom(1)} accessibilityLabel="Apropie harta">
          <Plus size={22} color={colors.foreground} />
        </FloatingControl>
        <FloatingControl onPress={() => zoom(-1)} accessibilityLabel="Depărtează harta">
          <Minus size={22} color={colors.foreground} />
        </FloatingControl>
        <FloatingControl
          onPress={recenter}
          accessibilityLabel="Centrează pe poziția mea"
          className="bg-primary border-primary"
        >
          <Navigation
            size={20}
            color={colors.primaryForeground}
            fill={colors.primaryForeground}
          />
        </FloatingControl>
      </View>

      {/* Only once there is something to say. Until the driver searches, this
          tab is the map it has always been -- a sheet resting over it with
          nothing in it would be a permanent tax on the city. */}
      {sheetPlace ? (
        <MapSheet
          snapPoints={SHEET_STOPS}
          visible={!!destination && !searching}
          onHidden={() => setSheetPlace(null)}
          index={sheetIndex}
          onIndexChange={setSheetIndex}
          bottomInset={floatingTabBarInset(insets.bottom)}
          header={
            <DestinationHeader
              place={sheetPlace}
              count={ranked?.length ?? 0}
              onPress={openSearch}
              onClear={clearDestination}
            />
          }
        >
          <ScrollView>
            <ResultList
              spots={ranked ?? []}
              onPick={(spot) =>
                router.push({ pathname: "/garage", params: { id: spot.id } })
              }
            />
          </ScrollView>
        </MapSheet>
      ) : null}

      <SpotFilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(DEFAULT_FILTERS)}
        resultCount={shownCount}
        hasLocation={!!location}
      />
    </View>
  );
}
