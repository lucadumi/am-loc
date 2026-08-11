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
import { Rating } from "@/components/rating";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { windowsFor } from "@/lib/availability-windows";
import { isPrivate, mayDeclare } from "@/lib/private-spots";
import { withOffers, type OfferedSpot } from "@/lib/private-spots";
import { spotName } from "@/lib/spot-name";
import { OwnerOffer } from "@/components/owner-offer";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { IconButton } from "@/components/ui/icon-button";
import { Text } from "@/components/ui/text";
import { palette, scrim, shadow, statusColor } from "@/constants/theme";
import { useCurrentLocation } from "@/hooks/use-current-location";
import { getSpotById } from "@/lib/api";
import { resolveIdentity } from "@/lib/identity";
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
  const [spot, setSpot] = useState<OfferedSpot | null | undefined>(null);
  const [windows, setWindows] = useState<AvailabilityWindow[]>([]);
  /* Who is looking, which decides whether the owner's controls are drawn at
     all. Resolved beside the spot rather than read from the cache: this screen
     is reachable by a deep link from a map pin, so it cannot assume anything
     earlier has already asked. */
  const [me, setMe] = useState<string | null>(null);
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
    Promise.all([getSpotById(id), windowsFor(id), resolveIdentity()])
      .then(async ([found, offered, identity]) => {
        if (alive) {
          setWindows(offered);
          setMe(identity);
        }
        return found ? (await withOffers([found]))[0] : undefined;
      })
      .then((s) => {
        if (!alive) return;
        setSpot(s ?? undefined);
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
    return <LoadingScreen />;
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
  /**
   * The pin's colour, which is a question about who is entitled to speak.
   *
   * A private spot carries its owner's answer. A public one carries none: the
   * app knows where this car park is, how big it is and what it charges, and
   * nothing about whether there is room in it now. 838 of the 851 imported car
   * parks are in that position, and painting them a status colour would have
   * this screen assert something nobody ever said. Grey says the true thing.
   */
  const pinColor = spot.status
    ? statusColor[spot.status]
    : palette.mutedForeground;
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
                  style={{ backgroundColor: pinColor, ...shadow.marker }}
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
            colors={[scrim.overlay, scrim.overlayEnd]}
            style={{ position: "absolute", top: 0, left: 0, right: 0, height: 120 }}
            pointerEvents="none"
          />

          {/* Tap-through hint */}
          <Chip
            pointerEvents="none"
            surface="floating"
            className="absolute bottom-4 right-4"
          >
            <Navigation size={13} color={palette.indigo[600]} strokeWidth={2.4} />
            <Text className="font-semi text-xs text-foreground">
              Deschide în Hărți
            </Text>
          </Chip>
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
            <Chip>
              <Banknote size={14} color={palette.mutedForeground} />
              <Text className="font-semi text-sm text-foreground">
                {formatPrice(spot.pricePerHour, spot.paid)}
              </Text>
            </Chip>
            {isPrivate(spot) ? (
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
              mine={!!me && mayDeclare(spot, me)}
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
          <IconButton
            size="sm"
            onPress={() => router.back()}
            accessibilityLabel="Înapoi"
          >
            <ArrowLeft size={20} color={palette.foreground} />
          </IconButton>
          {spot.status ? (
            <StatusBadge
              status={spot.status}
              className="border-hairline border-border bg-card"
            />
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}
