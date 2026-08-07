import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  Banknote,
  MapPin,
  Navigation,
  SquareParking,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/screen-header";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { Rating } from "@/components/rating";
import { windowsFor } from "@/lib/availability-windows";
import { isPrivate, mayDeclare, mayReport } from "@/lib/private-spots";
import { believeAll, type BelievedSpot } from "@/lib/spot-belief";
import { spotName } from "@/lib/spot-name";
import { LOCAL_REPORTER_ID } from "@/lib/spot-reports";
import type { ConfidenceLevel } from "@/lib/spot-state";
import { OwnerOffer } from "@/components/owner-offer";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { palette, statusColor } from "@/constants/theme";
import { useCurrentLocation } from "@/hooks/use-current-location";
import { getSpotById } from "@/lib/api";
import {
  distanceMeters,
  formatDistance,
  formatPrice,
} from "@/lib/geo";
import { haptics } from "@/lib/haptics";
import { AvailabilityWindow, ParkingSpot } from "@/types";

/** Where the hero map opens: a neighbourhood, like the list behind it. */
const OPEN_SPAN = 0.03;

/** Where it settles: close enough to see which side of the street. */
const CLOSE_SPAN = 0.004;

/** Opens the platform maps app with driving directions to the spot. */
function openDirections(spot: ParkingSpot) {
  haptics.selection();
  const { latitude, longitude, title } = spot;
  const label = encodeURIComponent(title);
  const url = Platform.select({
    ios: `http://maps.apple.com/?daddr=${latitude},${longitude}&q=${label}`,
    android: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${label})`,
    default: `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
  });
  if (url) Linking.openURL(url).catch(() => {});
}

export default function GarageScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const location = useCurrentLocation();

  // null = loading, undefined = not found, object = resolved.
  const [spot, setSpot] = useState<BelievedSpot | null | undefined>(null);
  const [confidence, setConfidence] = useState<ConfidenceLevel>("none");
  const [windows, setWindows] = useState<AvailabilityWindow[]>([]);
  const heroMap = useRef<MapView>(null);

  /* Bumped whenever the owner opens or withdraws a window, so the screen
     re-reads rather than patching its own copy of the truth. The offer is
     computed from the windows by `withBelief`, and a local edit that skipped
     that would show the owner a different answer from the one every other
     driver sees. */
  const [revision, setRevision] = useState(0);
  const reload = () => setRevision((n) => n + 1);

  useEffect(() => {
    let alive = true;
    if (!id) {
      setSpot(undefined);
      return;
    }
    Promise.all([getSpotById(id), windowsFor(id)])
      .then(async ([found, offered]) => {
        if (alive) setWindows(offered);
        return found ? (await believeAll([found]))[0] : undefined;
      })
      .then((s) => {
        if (!alive) return;
        setSpot(s ?? undefined);
        if (s) setConfidence(s.confidenceLevel);
      })
      // `null` is the loading state, so a rejection left here would spin
      // forever. Resolving to "not found" at least ends the wait.
      .catch((error) => {
        console.error("Could not load the spot", error);
        if (alive) setSpot(undefined);
      });
    return () => {
      alive = false;
    };
  }, [id, revision]);

  /* The zoom-in. The list the driver came from was showing the neighbourhood,
     so the map arrives at that scale and closes onto the kerb: the movement is
     what says "this one", and it is the same gesture whether they came from the
     home carousel or from the map on the see-all page. */
  useEffect(() => {
    if (!spot) return;
    const timer = setTimeout(() => {
      heroMap.current?.animateToRegion(
        {
          latitude: spot.latitude,
          longitude: spot.longitude,
          latitudeDelta: CLOSE_SPAN,
          longitudeDelta: CLOSE_SPAN,
        },
        620,
      );
    }, 260);
    return () => clearTimeout(timer);
  }, [spot?.id, spot?.latitude, spot?.longitude, spot]);

  if (spot === null) {
    return (
      <View className="flex-1 bg-background">
        <SafeAreaView edges={["top"]}>
          <ScreenHeader />
        </SafeAreaView>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={palette.primary} />
        </View>
      </View>
    );
  }

  if (spot === undefined) {
    return (
      <View className="flex-1 bg-background">
        <SafeAreaView edges={["top"]}>
          <ScreenHeader title="Detalii" />
        </SafeAreaView>
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <MapPin size={40} color={palette.mutedForeground} strokeWidth={1.6} />
          <Text className="text-center font-title text-lg text-foreground">
            Locul nu a fost găsit
          </Text>
          <Button
            variant="secondary"
            label="Înapoi"
            onPress={() => router.back()}
            className="mt-2"
          />
        </View>
      </View>
    );
  }

  const displayStatus = spot.status;
  /**
   * The pin's colour, which is how this screen says whether the place is free.
   *
   * Grey when nobody has reported, rather than the red `taken` resolves to.
   * A spot with no observation is flattened to `taken` because that is the
   * safe default for filtering and ranking -- see `toParkingSpot` in
   * lib/supabase-rows.ts -- but a red pin is not a default, it is a claim that
   * somebody looked and the place was full. 838 of the 851 imported car parks
   * carry no observation at all, so painting them red would have this screen
   * assert that essentially every car park in Bucharest is occupied, on no
   * evidence. Grey says the true thing: nobody has checked.
   */
  const pinColor =
    confidence === "none" ? palette.mutedForeground : statusColor[displayStatus];
  const dist = location
    ? distanceMeters(
        location.latitude,
        location.longitude,
        spot.latitude,
        spot.longitude,
      )
    : null;
  /* Straight off the spot, and no further. How many spaces a car park holds
     and how many are free are facts somebody counted; which particular bay is
     free is not, so there is no floor plan here. Drawing one would mean
     inventing the bays, and a driver would read the invention as a survey. */
  const totalFree = spot.availableCount ?? null;
  const totalCapacity = spot.totalCount ?? null;
  /* Two different sentences, because they are two different facts and only one
     of them is usually known. `104 locuri` is the size of the car park, which
     the registries do record. `3/104 libere` additionally claims somebody
     counted the empty ones, which no source in Bucharest publishes -- so it is
     said only when a driver actually reported a count. Before this, the free
     number was `null` for all 865 imported car parks and the line rendered as
     "/104 libere", which read as a survey that had come back blank. */
  const capacityLabel =
    totalCapacity == null
      ? null
      : totalFree == null
        ? `${totalCapacity} locuri`
        : `${totalFree}/${totalCapacity} libere`;
  const HERO_H = Math.round(Math.min(Math.max(screenH * 0.44, 300), 460));

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 16) + 24,
        }}
      >
        {/* Hero map: the pin marks the spot's exact location (tap → Hărți) */}
        <Pressable
          onPress={() => openDirections(spot)}
          accessibilityRole="button"
          accessibilityLabel="Deschide traseul în Hărți"
          style={{ height: HERO_H }}
        >
          <View pointerEvents="none" style={{ flex: 1 }}>
            <MapView
              ref={heroMap}
              provider={PROVIDER_DEFAULT}
              style={{ flex: 1 }}
              /* Opens wide and closes in. `initialRegion` rather than `region`
                 so the animation below owns the camera; with a controlled
                 region the map snaps back to it and the zoom never plays. */
              initialRegion={{
                latitude: spot.latitude,
                longitude: spot.longitude,
                latitudeDelta: OPEN_SPAN,
                longitudeDelta: OPEN_SPAN,
              }}
              userInterfaceStyle="light"
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
            >
              <Marker
                coordinate={{
                  latitude: spot.latitude,
                  longitude: spot.longitude,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View
                  className="h-12 w-12 items-center justify-center rounded-full border-[3px] border-background"
                  style={{
                    backgroundColor: pinColor,
                    shadowColor: "#000",
                    shadowOpacity: 0.25,
                    shadowRadius: 6,
                    shadowOffset: { width: 0, height: 3 },
                    elevation: 5,
                  }}
                >
                  <Text className="font-heavy text-lg text-primary-foreground">
                    P
                  </Text>
                </View>
              </Marker>
            </MapView>
          </View>

          {/* Scrim keeps the floating controls legible over the map */}
          <LinearGradient
            colors={["rgba(20,20,22,0.22)", "rgba(20,20,22,0)"]}
            style={{ position: "absolute", top: 0, left: 0, right: 0, height: 120 }}
            pointerEvents="none"
          />

          {/* Tap-through hint */}
          <View
            pointerEvents="none"
            className="absolute bottom-4 right-4 flex-row items-center gap-1.5 rounded-full border-hairline border-border bg-card/95 px-3 py-1.5"
          >
            <Navigation size={13} color={palette.indigo[600]} strokeWidth={2.4} />
            <Text className="font-semi text-xs text-foreground">
              Deschide în Hărți
            </Text>
          </View>
        </Pressable>

        {/* Detail sheet */}
        <View className="bg-background px-5 pt-5">
          {/* Title, then the facts about it, then what it costs.

              The price sits with the other facts rather than beside the title.
              On the same row it would make the heading's width depend on how
              long the price happens to be — "Tarif necunoscut" is a good deal
              longer than "5 lei / oră", which would squeeze one car park's
              street name into two cramped lines while leaving another alone. */}
          <Text className="font-heavy text-2xl leading-8 text-foreground">
            {spotName(spot)}
          </Text>

          {/* Where it is, and what people make of it. The pin only earns its
              place when there is somewhere to point at: `area` is derived from
              the sector outlines, and a car park outside all six -- one sits in
              Voluntari, in Ilfov -- is left without one rather than given a
              sector it is not in. The score is always drawn, hollow until
              somebody gives it one; see components/rating.tsx. */}
          <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
            {spot.area ? (
              <>
                <MapPin
                  size={14}
                  color={palette.coral}
                  strokeWidth={2.2}
                  style={{ flexShrink: 0 }}
                />
                <Text className="font-mid text-sm text-muted-foreground">
                  {spot.area}
                </Text>
                <Text className="font-mid text-sm text-muted-foreground">·</Text>
              </>
            ) : null}
            <Rating value={spot.rating} size={14} />
          </View>

          {dist != null || capacityLabel != null ? (
            <View className="mt-1.5 flex-row flex-wrap items-center gap-1.5">
              {dist != null ? (
                <>
                  <Navigation
                    size={13}
                    color={palette.indigo[600]}
                    strokeWidth={2.4}
                  />
                  <Text className="font-semi text-sm text-foreground">
                    {formatDistance(dist)}
                  </Text>
                </>
              ) : null}
              {dist != null && capacityLabel != null ? (
                <Text className="font-mid text-sm text-muted-foreground">·</Text>
              ) : null}
              {capacityLabel != null ? (
                <>
                  <SquareParking
                    size={14}
                    color={palette.free}
                    strokeWidth={2.2}
                  />
                  <Text className="font-semi text-sm text-foreground">
                    {totalFree == null ? (
                      <>
                        {totalCapacity}{" "}
                        <Text className="font-mid text-muted-foreground">
                          locuri
                        </Text>
                      </>
                    ) : (
                      <>
                        {totalFree}/{totalCapacity}{" "}
                        <Text className="font-mid text-muted-foreground">
                          libere
                        </Text>
                      </>
                    )}
                  </Text>
                </>
              ) : null}
            </View>
          ) : null}

          {/* What it costs, and how much to believe the pin's colour. The two
              belong together: the pin says what the app claims, this says
              whether that claim is still worth acting on. */}
          <View className="mt-3 flex-row flex-wrap items-center gap-2">
            <View className="flex-row items-center gap-1.5 rounded-full border-hairline border-border bg-card px-3 py-1.5">
              <Banknote size={14} color={palette.mutedForeground} />
              <Text className="font-semi text-sm text-foreground">
                {formatPrice(spot.pricePerHour, spot.paid)}
              </Text>
            </View>
            <ConfidenceBadge level={confidence} />
            {!mayReport(spot) ? (
              <Text className="font-mid text-xs text-muted-foreground">
                {spot.ownerName
                  ? `${spot.ownerName} spune când e liber`
                  : "Proprietarul spune când e liber"}
              </Text>
            ) : null}
          </View>

          {/* What the owner has actually offered, and — if this is your spot —
              the controls to change it. */}
          {isPrivate(spot) ? (
            <OwnerOffer
              spot={spot}
              windows={windows}
              offer={spot.offer}
              mine={mayDeclare(spot, LOCAL_REPORTER_ID)}
              onChanged={reload}
            />
          ) : null}
        </View>
      </ScrollView>

      {/* Floating controls over the map: back (left), and what the pin's
          colour means (right). The badge is the pin's legend rather than a
          second opinion — same status, named, so a colour nobody has learned
          yet still reads. */}
      <SafeAreaView
        edges={["top"]}
        className="absolute inset-x-0 top-0"
        pointerEvents="box-none"
      >
        <View className="flex-row items-center justify-between px-5 py-2.5">
          <Pressable
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full border-hairline border-border bg-card"
            accessibilityRole="button"
            accessibilityLabel="Înapoi"
          >
            <ArrowLeft size={20} color={palette.foreground} />
          </Pressable>
          <StatusBadge
            status={displayStatus}
            unknown={confidence === "none"}
            className="border-hairline border-border bg-card"
          />
        </View>
      </SafeAreaView>
    </View>
  );
}
