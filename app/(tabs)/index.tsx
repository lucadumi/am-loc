import { useFocusEffect, useRouter } from "expo-router";
import {
  ArrowUpRight,
  ChevronRight,
  History,
} from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Banner } from "@/components/banner";
import { GreetingHeader } from "@/components/greeting-header";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { SearchBar } from "@/components/search-bar";
import { SectionHeader } from "@/components/section-header";
import { SpotCard } from "@/components/spot-card";
import { SpotImage } from "@/components/spot-image";
import { Text } from "@/components/ui/text";
import { VehicleChips } from "@/components/vehicle-chips";
import { useColors } from "@/hooks/use-theme";
import { floatingTabBarInset } from "@/constants/layout";
import { useCurrentLocation } from "@/hooks/use-current-location";
import { useLive } from "@/hooks/use-live";
import { getSpots, rankNearby } from "@/lib/api";
import { resolveAccount } from "@/lib/identity";
import { withOffers, type OfferedSpot } from "@/lib/private-spots";
import { spokenSpot, spotName } from "@/lib/spot-name";
import { ParkingSpot } from "@/types";

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const location = useCurrentLocation();
  const [spots, setSpots] = useState<OfferedSpot[] | null>(null);
  const [failed, setFailed] = useState(false);
  /* What to call the driver. Absent until they set one, which is what
     `GreetingHeader` already falls back on -- so this is loaded beside the
     spots rather than being waited for: a greeting is not worth holding the
     page open, and "Bine ai revenit, Șofer" is the honest line for somebody
     who has not told us their name. */
  const [name, setName] = useState<string | undefined>();

  // How much to believe a spot depends on who reported it, so the reporter
  // records have to load with the spots rather than after them.
  const load = useCallback(() => {
    getSpots()
      .then((loaded) => withOffers(loaded))
      .then((believed) => {
        setSpots(believed);
        setFailed(false);
      })
      // Reading spots is a network call once a backend is configured, and a
      // screen that fails silently looks exactly like a city with nothing
      // free in it. Say which one it is.
      .catch((error) => {
        console.error("Could not load spots", error);
        setSpots([]);
        setFailed(true);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      // The spots go through `load` rather than being read inline here: it is
      // the same callback the change feed drives, so a kerb that changes while
      // the driver is looking at this screen takes the same path as one that
      // changed while they were away.
      load();
      // On focus rather than on mount: this tab stays mounted for the life of
      // the app, so a name set on the profile screen would otherwise not show
      // here until the app was restarted.
      resolveAccount()
        .then((account) => setName(account.displayName))
        .catch(() => {});
    }, [load]),
  );

  // "Locuri libere pentru tine" is a list of claims other people are making
  // right now, so it has to change when they do.
  useLive("spots", load);

  const openSpot = (spot: ParkingSpot) =>
    router.push({ pathname: "/garage", params: { id: spot.id } });

  /* The list this screen exists for: what is around the driver, nearest first
     and cheapest among equals. Nothing is filtered on availability -- most car
     parks in the city carry no observation at all, and dropping those would
     leave the page empty in the middle of a hundred real ones. */
  const nearby = useMemo(
    () => (location && spots ? rankNearby(spots, location, { limit: 8 }) : []),
    [spots, location],
  );

  /**
   * The line under the greeting.
   *
   * It used to be the driver's location, which said "București" to an app that
   * only works in București -- a sentence that is true, constant and therefore
   * worth no space at the top of the screen.
   *
   * What goes there instead has to be a fact about right now, and the free
   * count is the only one the app produces that nothing else in the city
   * publishes. It is stated only when somebody has actually reported a space:
   * with no reports the honest line is how much parking is around, not a
   * confident "0 locuri libere", which would read as a full city rather than
   * as a quiet one. The two say different things and only one of them is ever
   * true here.
   */
  const headline = useMemo(() => {
    if (!location || !spots) return "Se localizează…";

    const around = rankNearby(spots, location, { limit: 500 });
    if (!around.length) return "Nicio parcare în apropiere";

    /* How many places there are to try, not how many are free. Nobody counts a
       public car park for this app, so "3 locuri libere" would be a number
       invented for the headline. `around` is real: these car parks exist, at
       these distances, at these prices. */
    const nearby = around.length;
    if (nearby) {
      return nearby === 1
        ? "1 parcare în apropiere"
        : `${nearby} parcări în apropiere`;
    }
    return around.length === 1
      ? "1 parcare în apropiere"
      : `${around.length} parcări în apropiere`;
  }, [spots, location]);

  const last = spots?.find((s) => s.kind === "garage") ?? spots?.[0];

  /* The whole screen waits, rather than the list inside it. Everything on this
     page is downstream of the spots -- the greeting's subtitle counts them,
     the carousel is them -- so a header over an empty body would be a page
     that looks finished and is not. */
  if (spots === null) return <LoadingScreen />;

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: floatingTabBarInset(insets.bottom) + 12,
        }}
      >
        {/* Yellow bleed so the top overscroll bounce stays yellow */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -800,
            left: 0,
            right: 0,
            height: 800,
            backgroundColor: colors.primary,
          }}
        />

        {/* Yellow hero: paddingTop paints the status-bar inset too */}
        <View
          style={{ paddingTop: insets.top + 8 }}
          className="gap-5 bg-primary px-5 pb-[60px]"
        >
          <GreetingHeader
            onPrimary
            {...(name ? { name } : {})}
            subtitle={headline}
            onProfile={() => router.push("/profile")}
            onNotifications={() => router.push("/notifications")}
            onArchived={() => router.push("/archived")}
          />
          {/* Straight to the map with the search open, rather than to a
              screen of its own. The answers are places on a map, so the map is
              where the question belongs -- and a tab that is already mounted
              needs a fresh value each time, or a second tap on the same
              parameter changes nothing. */}
          <SearchBar
            onPress={() =>
              router.push({
                pathname: "/map",
                params: { search: String(Date.now()) },
              })
            }
          />
          <Text className="font-title text-base text-primary-foreground">
            Categorii
          </Text>
        </View>

        {/* Light body */}
        <View className="flex-1 bg-background">
          {/* Elevated categories box straddling the yellow / light seam */}
          <View
            style={{ marginTop: -52 }}
            className="mx-5 overflow-hidden rounded-xl border-hairline border-border bg-card"
          >
            <View className="p-4">
              <VehicleChips />
            </View>
          </View>

          <View className="mt-7 gap-3">
            <SectionHeader
              title="Lângă tine"
              actionIcon={ArrowUpRight}
              onAction={() => router.push("/nearby")}
              className="px-5"
            />
            {nearby.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 14, paddingHorizontal: 20 }}
              >
                {nearby.slice(0, 6).map((s) => (
                  <SpotCard key={s.id} spot={s} onPress={() => openSpot(s)} />
                ))}
              </ScrollView>
            ) : (
              <Text className="px-5 font-mid text-sm text-muted-foreground">
                {failed
                  ? "Nu am putut încărca locurile."
                  : "Nicio parcare în apropiere."}
              </Text>
            )}
          </View>

          <Banner
            className="mt-7"
            image={require("../../assets/images/parking.jpg")}
            label="Găsește parcare în câteva secunde"
            onPress={() => router.push("/map")}
          />

          {last ? (
            <View className="mt-7 gap-3 px-5">
              <SectionHeader title="Ultima parcare" actionIcon={History} />
              <Pressable
                onPress={() => openSpot(last)}
                accessibilityRole="button"
                accessibilityLabel={`Ultima parcare: ${spokenSpot(last)}`}
                className="flex-row items-center gap-3 rounded-lg border-hairline border-border bg-card p-3"
              >
                <SpotImage
                  kind={last.kind}
                  iconSize={22}
                  className="h-14 w-14 rounded-md"
                />
                <View className="flex-1">
                  <Text
                    numberOfLines={1}
                    className="font-title text-base text-foreground"
                  >
                    {spotName(last)}
                  </Text>
                  {/* The area is absent on every imported car park, and a
                          bare "· Fără raportări" reads as a missing word. */}
                  <Text className="font-mid text-xs text-muted-foreground">
                    {last.area ?? "Parcare publică"}
                  </Text>
                </View>
                <ChevronRight size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
