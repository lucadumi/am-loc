import {
  Minus,
  Navigation,
  Plus,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { FloatingControl } from "@/components/floating-control";
import { SearchBar } from "@/components/search-bar";
import { SpotFilterSheet } from "@/components/spot-filter-sheet";
import { IconButton } from "@/components/ui/icon-button";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { palette, shadow, statusColor, statusLabel } from "@/constants/theme";
import { floatingTabBarInset } from "@/constants/layout";
import { useCurrentLocation } from "@/hooks/use-current-location";
import { useLive } from "@/hooks/use-live";
import { getReports, getSpots } from "@/lib/api";
import { withOffers, type OfferedSpot } from "@/lib/private-spots";
import {
  DEFAULT_FILTERS,
  countActiveFilters,
  filterSpots,
  spotCountLabel,
} from "@/lib/filters";
import { BUCHAREST } from "@/lib/geo";
import { BlockerReport, SpotFilters } from "@/types";

/**
 * What the pins mean.
 *
 * The hollow entry is not decoration. `unreliable` draws a pin hollow whenever
 * the claim behind it has gone stale, is contested, or was never made at all --
 * and that last case is 838 of the 851 imported car parks, so the commonest
 * pin on this map is a grey outline. A legend that listed only the three solid
 * states would explain the rare pins and leave the usual one a mystery.
 */
const LEGEND_ITEMS: { color: string; label: string; hollow?: boolean }[] = [
  { color: statusColor.free, label: `${statusLabel.free} · loc privat` },
  { color: statusColor.taken, label: `${statusLabel.taken} · loc privat` },
  { color: palette.mutedForeground, label: "Parcare publică", hollow: true },
  { color: palette.destructive, label: "Sesizare" },
];

function Legend() {
  return (
    <View className="gap-2 rounded-xl border-hairline border-border bg-card px-3.5 py-3">
      {LEGEND_ITEMS.map((item) => (
        <View key={item.label} className="flex-row items-center gap-2.5">
          <View className="w-4 items-center">
            <View
              className="h-2.5 w-2.5 rounded-full"
              style={
                item.hollow
                  ? { borderWidth: 1.5, borderColor: item.color }
                  : { backgroundColor: item.color }
              }
            />
          </View>
          <Text className="font-mid text-xs text-foreground">{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Square button beside the search bar; a yellow badge shows the active count. */
function FilterButton({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) {
  return (
    <IconButton
      size="lg"
      onPress={onPress}
      accessibilityLabel="Filtre"
      style={shadow.card}
    >
      <SlidersHorizontal size={22} color={palette.foreground} />
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
function pinColor(spot: OfferedSpot): string {
  return spot.status ? statusColor[spot.status] : palette.mutedForeground;
}

/** Nobody has standing to say whether this one is free. */
function unreliable(spot: OfferedSpot): boolean {
  return !spot.status;
}

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const router = useRouter();
  const location = useCurrentLocation();
  const insets = useSafeAreaInsets();
  /* Arriving from a report: where to fly, and which pin to ring. Flown once
     per set of coordinates rather than on every focus, so coming back to the
     tab later leaves the map where the driver left it. */
  const { lat, lng, focus } = useLocalSearchParams<{
    lat?: string;
    lng?: string;
    focus?: string;
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
        userInterfaceStyle="light"
        showsMyLocationButton={false}
        showsCompass={false}
      >
        {visibleSpots.map((s) => (
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
                  ? { backgroundColor: palette.background, borderColor: pinColor(s) }
                  : { backgroundColor: pinColor(s) }
              }
            >
              <Text
                className="font-heavy text-sm"
                style={{
                  color: unreliable(s) ? pinColor(s) : palette.primaryForeground,
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
                style={{ backgroundColor: palette.destructive }}
              >
                <TriangleAlert
                  size={ringed ? 20 : 16}
                  color={palette.primaryForeground}
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
            <View className="h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-indigo-600">
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

      <SafeAreaView
        edges={["top"]}
        className="absolute inset-x-0 top-0 bg-primary px-5 pb-3 pt-2"
        pointerEvents="box-none"
      >
        <View className="flex-row items-center gap-3">
          <SearchBar
            placeholder="Caută un loc de parcare…"
            className="flex-1"
            onPress={() => router.push("/search")}
          />
          <FilterButton count={activeCount} onPress={() => setFilterOpen(true)} />
        </View>
        {activeCount > 0 ? (
          <Pressable
            onPress={() => setFilterOpen(true)}
            className="mt-3 flex-row items-center gap-2 self-start rounded-full bg-indigo-600 px-3.5 py-1.5"
            style={shadow.card}
          >
            <Text className="font-heavy text-xs text-card">
              {spotCountLabel(visibleSpots.length)}
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
        <FloatingControl onPress={() => zoom(1)}>
          <Plus size={22} color={palette.foreground} />
        </FloatingControl>
        <FloatingControl onPress={() => zoom(-1)}>
          <Minus size={22} color={palette.foreground} />
        </FloatingControl>
        <FloatingControl onPress={recenter} className="bg-primary border-primary">
          <Navigation
            size={20}
            color={palette.primaryForeground}
            fill={palette.primaryForeground}
          />
        </FloatingControl>
      </View>

      <View
        className="absolute left-5"
        style={{ bottom: floatingTabBarInset(insets.bottom) + 8 }}
        pointerEvents="none"
      >
        <Legend />
      </View>

      <SpotFilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(DEFAULT_FILTERS)}
        resultCount={visibleSpots.length}
        hasLocation={!!location}
      />
    </View>
  );
}
