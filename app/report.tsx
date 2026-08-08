import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
  Camera,
  Image as ImageIcon,
  MapPin,
  TriangleAlert,
  X,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/screen-header";
import { Screen } from "@/components/ui/screen";
import { Spinner } from "@/components/ui/spinner";
import { SlideButton } from "@/components/slide-button";
import { Button } from "@/components/ui/button";
import { Input, TextArea } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { reportCategoryColor, reportCategoryIcon } from "@/constants/reports";
import { palette, scrim, shadow } from "@/constants/theme";
import { useCurrentLocation } from "@/hooks/use-current-location";
import { addReport, getReportById, updateReport } from "@/lib/api";
import { BUCHAREST, formatCoords } from "@/lib/geo";
import { mayFileAt } from "@/lib/report-place";
import { haptics } from "@/lib/haptics";
import { BlockerReport, REPORT_CATEGORIES, ReportCategory } from "@/types";

/**
 * How many photographs one report can carry.
 *
 * Six, because a blocked pavement is usually argued with two or three (the
 * wide shot that shows what is blocked, the close one that shows the plate)
 * and a complaint arriving with twenty attachments is one nobody opens.
 */
const MAX_PHOTOS = 6;

/** Section label above each block of the form. */
function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="mb-2 font-title text-sm text-foreground">{children}</Text>
  );
}

export default function ReportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const location = useCurrentLocation();
  /* An id means this is a correction, not a new report. What that changes is
     mostly where the coordinates come from: an edit keeps the ones the report
     was filed with, because a report is a claim about a place at a time and
     re-stamping it with wherever the driver happens to be standing now would
     move the blockage to their sofa.

     A category means the driver arrived from `add-spot`, having tried to
     announce a free space on a crossing. The kerb layer already knows what is
     there, so asking them to pick it off a list again would be the app
     pretending not to know something it just said out loud. Validated rather
     than trusted: a param is a string from a URL, and only the five the form
     actually has are allowed through. */
  const { id, category: suggested } = useLocalSearchParams<{
    id?: string;
    category?: string;
  }>();
  const editing = !!id;

  const [category, setCategory] = useState<ReportCategory | null>(
    REPORT_CATEGORIES.find((c) => c.key === suggested)?.key ?? null,
  );
  const [plate, setPlate] = useState("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [edited, setEdited] = useState<BlockerReport | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /**
   * Whatever went wrong last time the driver tried, in their own language.
   *
   * The submit used to `catch {}` and buzz, which is the same signal for "you
   * are offline", "that photograph is a format the bucket refuses" and "the
   * server said no". All three are things a driver can act on and none of them
   * was being said.
   */
  const [failure, setFailure] = useState<string | null>(null);
  /**
   * Where the driver has put the pin, once they have moved it.
   *
   * Null means they have not, and the map follows the device instead. Kept
   * apart from the fix rather than seeded from it, because "the app thinks I
   * am here" and "I am telling you the car is there" are different claims and
   * only the second one is worth filing on.
   */
  const [placed, setPlaced] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    getReportById(id)
      .then((report) => {
        if (!alive || !report) return;
        setEdited(report);
        setCategory(report.category);
        setPlate(report.plate ?? "");
        setNote(report.note ?? "");
        setPhotos(report.photos ?? []);
      })
      .catch((error) => console.error("Could not load the report", error));
    return () => {
      alive = false;
    };
  }, [id]);

  const room = MAX_PHOTOS - photos.length;

  /* Appended, never replaced: a blocked pavement usually needs the wide shot
     that proves where the car is and the close one that proves the plate. */
  const attach = (uris: string[]) =>
    setPhotos((current) => [...current, ...uris].slice(0, MAX_PHOTOS));

  const pickFromCamera = async () => {
    haptics.selection();
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    /* Said out loud rather than returned silently. A button that opens no
       camera and explains nothing reads as a broken button, and the driver
       cannot know the fix is in the system settings. */
    if (!perm.granted) {
      haptics.warning();
      setFailure(
        "Nu am acces la cameră. Poți activa accesul din setările telefonului, sau poți alege o poză din galerie.",
      );
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.6,
    });
    if (!res.canceled) {
      setFailure(null);
      attach(res.assets.map((a) => a.uri));
    }
  };

  const pickFromLibrary = async () => {
    haptics.selection();
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.6,
      allowsMultipleSelection: true,
      selectionLimit: room,
    });
    if (!res.canceled) {
      setFailure(null);
      attach(res.assets.map((a) => a.uri));
    }
  };

  const removePhoto = (uri: string) => {
    haptics.selection();
    setPhotos((current) => current.filter((p) => p !== uri));
  };

  /**
   * The place being reported, and whether it is good enough to file on.
   *
   * `pin` is what the map shows: the driver's own placement if they have
   * dragged it, then the report's own coordinates on an edit, then the device
   * fix, and only then the centre of Bucharest so the map has somewhere to
   * point.
   *
   * `placeable` is the separate question of whether that is worth acting on,
   * and it is the correctness fix in this screen. The old code filed at
   * `location ?? BUCHAREST` on the grounds that a report should never be lost.
   * But a blocked pavement pinned to Piața Universității is worse than no
   * report at all: somebody walks to a street where nothing is wrong, and the
   * real blockage is never seen. `CurrentLocation` already grades its own
   * answer -- its doc says the three sources are "metres, kilometres and
   * nothing" -- and this screen was ignoring the grade.
   *
   * So: a GPS fix is good enough on its own, and anything less has to be
   * confirmed by the driver dragging the pin, which turns the app's guess into
   * their statement. An edit keeps the coordinates it was filed with, which
   * were already vouched for once.
   */
  const pin = placed ?? edited ?? location ?? BUCHAREST;
  const placeable = mayFileAt({
    placed: !!placed,
    source: location?.source,
    editing,
  });

  const placeLabel = editing
    ? (edited?.address ?? "Sesizarea originală")
    : placed
      ? "Locul pe care l-ai ales"
      : (location?.label ?? "Se localizează…");

  const submit = async () => {
    if (!category || !placeable || submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      if (id) {
        await updateReport(id, {
          category,
          plate: plate.trim() || undefined,
          note: note.trim() || undefined,
          photos: photos.length ? photos : undefined,
        });
      } else {
        await addReport({
          category,
          latitude: pin.latitude,
          longitude: pin.longitude,
          plate: plate.trim() || undefined,
          note: note.trim() || undefined,
          photos: photos.length ? photos : undefined,
          /* Only the fix has an address to give. A dragged pin is somewhere the
             driver picked off a map, and labelling it with the street the phone
             happens to be on would be worse than saying nothing. */
          address: placed ? undefined : location?.label,
        });
      }
      haptics.success();
      router.replace("/report-sent");
    } catch (error) {
      /* Shown rather than swallowed. This fails for reasons the driver can act
         on -- no signal, or a photograph in a format the bucket refuses, which
         `lib/supabase-data.ts` already words in Romanian -- and every one of
         them used to arrive as the same buzz. */
      haptics.warning();
      setFailure(
        error instanceof Error && error.message
          ? error.message
          : "Nu am putut trimite sesizarea. Verifică conexiunea și încearcă din nou.",
      );
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title={editing ? "Editează sesizarea" : "Sesizează un blocaj"}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 20) + 24,
            gap: 24,
          }}
        >
          {/* Category */}
          <View>
            <FieldLabel>Ce tip de blocaj?</FieldLabel>
            {/* A gallery rather than a list. Five options that a driver is
                choosing between while standing next to the car are read by
                their icons, not by their sentences, and stacked full-width
                they pushed the photographs and the map below the fold.

                `flex-1` with `flex-wrap` is what handles the odd count: Yoga
                grows the items on each line to fill it, so four tiles pair up
                and the fifth spans the last row on its own rather than sitting
                beside a gap. The descriptions are gone with the list -- one of
                them runs to four lines at half width, and it would have set
                the height of all five. */}
            <View className="flex-row flex-wrap gap-2.5">
              {REPORT_CATEGORIES.map((c) => {
                const Icon = reportCategoryIcon[c.key];
                const color = reportCategoryColor[c.key];
                const active = category === c.key;
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => {
                      haptics.selection();
                      setCategory(c.key);
                    }}
                    className="items-center justify-start gap-2 rounded-lg px-3.5 py-4 active:opacity-80"
                    style={{
                      /* Three to a row, all the same width. `flexGrow` is left
                         at zero on purpose: grown, the two tiles on the second
                         row would stretch to half the screen each and sit
                         beside three narrow ones, and unequal tiles are the one
                         thing a gallery cannot have. A short gap at the end of
                         the last row reads as a grid with five items in it,
                         which is what this is. */
                      flexGrow: 0,
                      flexBasis: "30%",
                      /* Selection is already carried by the tinted surface and
                         the stronger icon wash. A coloured border added a
                         second signal and changed the tile's inner geometry
                         when selected, making the gallery visibly jump. */
                      borderWidth: active ? 0 : StyleSheet.hairlineWidth,
                      borderColor: palette.border,
                      backgroundColor: active ? color + "14" : palette.card,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${c.label}. ${c.description}`}
                    accessibilityState={{ selected: active }}
                  >
                    <View
                      className="h-12 w-12 items-center justify-center rounded-full"
                      style={{ backgroundColor: color + (active ? "2E" : "1F") }}
                    >
                      <Icon size={24} color={color} strokeWidth={2.1} />
                    </View>
                    {/* A fixed two-line box, so a one-line label does not make
                        its tile shorter than the one beside it. Rows already
                        stretch to their tallest tile; this is what keeps the
                        rows themselves the same height, and what stops a sixth
                        category with a longer name from resizing the grid. */}
                    <View className="h-8 justify-center">
                      <Text
                        numberOfLines={2}
                        className="text-center font-title text-xs leading-4 text-foreground"
                      >
                        {c.label}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Photos */}
          <View>
            <FieldLabel>
              {photos.length
                ? `Fotografii (${photos.length}/${MAX_PHOTOS})`
                : "Fotografii"}
            </FieldLabel>
            {photos.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingBottom: 12 }}
              >
                {photos.map((uri) => (
                  <View
                    key={uri}
                    className="overflow-hidden rounded-lg border-hairline border-border"
                  >
                    <Image
                      source={{ uri }}
                      style={{ width: 108, height: 108 }}
                      resizeMode="cover"
                    />
                    <Pressable
                      onPress={() => removePhoto(uri)}
                      className="absolute right-1.5 top-1.5 h-7 w-7 items-center justify-center rounded-full"
                      /* Strong enough to read over whatever the photograph
                         happens to be, which is the whole reason this level
                         exists separately from the map scrim. */
                      style={{ backgroundColor: scrim.control }}
                      accessibilityRole="button"
                      accessibilityLabel="Elimină fotografia"
                    >
                      <X size={15} color={palette.card} strokeWidth={2.4} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}
            {room > 0 ? (
              <View className="flex-row gap-3">
                <Button variant="card" onPress={pickFromCamera} className="flex-1">
                  <Camera size={20} color={palette.foreground} />
                  <Text className="font-semi text-sm text-foreground">
                    {photos.length ? "Încă o poză" : "Fă o poză"}
                  </Text>
                </Button>
                <Button variant="card" onPress={pickFromLibrary} className="flex-1">
                  <ImageIcon size={20} color={palette.foreground} />
                  <Text className="font-semi text-sm text-foreground">Galerie</Text>
                </Button>
              </View>
            ) : null}
          </View>

          {/* Plate */}
          <View>
            <FieldLabel>Număr de înmatriculare (opțional)</FieldLabel>
            <Input
              placeholder="ex: B 123 ABC"
              autoCapitalize="characters"
              autoCorrect={false}
              value={plate}
              onChangeText={setPlate}
              maxLength={12}
            />
          </View>

          {/* Note */}
          <View>
            <FieldLabel>Detalii (opțional)</FieldLabel>
            <TextArea
              placeholder="Cât blochează, de când, alte observații utile…"
              value={note}
              onChangeText={setNote}
              maxLength={280}
            />
          </View>

          {/* Location */}
          <View>
            <FieldLabel>Locație</FieldLabel>
            <View className="overflow-hidden rounded-lg border-hairline border-border bg-card">
              {/* Draggable when filing, frozen when correcting.

                  Even a good GPS fix is tens of metres out, and the driver is
                  the one person who knows which corner the car is on. Dragging
                  is also the way out of a poor fix: it turns the app's guess
                  into the driver's own statement, which is what `mayFileAt`
                  wants before anything is filed.

                  On an edit it is inert on purpose. A report's place cannot
                  change -- Postgres refuses it outright, in
                  `0003_blocker_reports.sql` -- so a pin that moved and then
                  quietly did not would be the worst kind of control. */}
              <View
                style={{ height: 170 }}
                pointerEvents={editing ? "none" : "auto"}
              >
                <MapView
                  provider={PROVIDER_DEFAULT}
                  style={{ flex: 1 }}
                  region={{
                    latitude: pin.latitude,
                    longitude: pin.longitude,
                    latitudeDelta: 0.006,
                    longitudeDelta: 0.006,
                  }}
                  userInterfaceStyle="light"
                  pitchEnabled={false}
                  rotateEnabled={false}
                  scrollEnabled={!editing}
                  zoomEnabled={!editing}
                  onPress={
                    editing
                      ? undefined
                      : (event) => {
                          haptics.selection();
                          setPlaced(event.nativeEvent.coordinate);
                        }
                  }
                >
                  <Marker
                    coordinate={{
                      latitude: pin.latitude,
                      longitude: pin.longitude,
                    }}
                    anchor={{ x: 0.5, y: 0.5 }}
                    /* The custom marker is visually static. Left at its
                       default, react-native-maps recaptures it as a bitmap on
                       every form render; selecting a category was enough for
                       Android to recompute its bounds and place the bitmap in
                       the map's top-right corner. Its coordinate still updates
                       with tracking disabled, only the unchanged artwork stops
                       being recaptured. */
                    tracksViewChanges={false}
                    draggable={!editing}
                    onDragEnd={(event) => {
                      haptics.selection();
                      setPlaced(event.nativeEvent.coordinate);
                    }}
                  >
                    <View
                      className="h-9 w-9 items-center justify-center rounded-full border-2 border-background"
                      style={{
                        backgroundColor: palette.destructive,
                        ...shadow.marker,
                      }}
                    >
                      <TriangleAlert
                        size={17}
                        color={palette.primaryForeground}
                        strokeWidth={2.4}
                      />
                    </View>
                  </Marker>
                </MapView>
              </View>
              <View className="gap-1 px-4 py-3">
                <View className="flex-row items-center gap-2">
                  <MapPin size={18} color={palette.mutedForeground} />
                  <Text
                    className="flex-1 font-mid text-sm text-foreground"
                    numberOfLines={1}
                  >
                    {placeLabel}
                  </Text>
                  <Text className="font-mid text-xs text-muted-foreground">
                    {formatCoords(pin.latitude, pin.longitude)}
                  </Text>
                </View>
                <Text className="font-mid text-xs leading-4 text-muted-foreground">
                  {editing
                    ? "Locul nu se poate schimba. Dacă blocajul e în altă parte, trimite o sesizare nouă."
                    : placed
                      ? "Poți muta pinul din nou dacă nu e exact."
                      : "Atinge harta sau trage pinul ca să marchezi locul exact."}
                </Text>
              </View>
            </View>
          </View>

          {/* Whatever went wrong last time, said plainly and kept until the
              driver does something about it. The form keeps everything it had,
              so a failed send costs a tap rather than the photographs. */}
          {failure ? (
            <View
              className="flex-row items-start gap-2.5 rounded-lg p-3.5"
              style={{
                backgroundColor: palette.destructive + "14",
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: palette.destructive + "40",
              }}
            >
              <TriangleAlert
                size={18}
                color={palette.destructive}
                strokeWidth={2.2}
                style={{ flexShrink: 0, marginTop: 1 }}
              />
              <Text className="flex-1 font-mid text-sm leading-5 text-foreground">
                {failure}
              </Text>
            </View>
          ) : null}

          {/* Submit */}
          {submitting ? (
            /* The slide is gone while this runs, deliberately. Photographs go
               to storage before the row is written, which on mobile data is
               seconds, and leaving a live control there invites a second slide
               that would file the report twice. */
            <View className="h-16 flex-row items-center justify-center gap-3 rounded-full bg-secondary">
              <Spinner size={26} />
              <Text className="font-semi text-foreground">
                {editing ? "Se salvează…" : "Se trimite…"}
              </Text>
            </View>
          ) : !category ? (
            <View className="h-16 items-center justify-center rounded-full bg-secondary">
              <Text className="font-semi text-muted-foreground">
                Alege tipul de blocaj
              </Text>
            </View>
          ) : !placeable ? (
            /* Refused, and told why. The alternative is the old behaviour,
               which filed the report at the centre of Bucharest and sent
               somebody to look at a street where nothing was wrong. */
            <View className="h-16 items-center justify-center gap-0.5 rounded-full bg-secondary px-6">
              <Text className="font-semi text-muted-foreground">
                Marchează locul pe hartă
              </Text>
              <Text className="text-center font-mid text-xs text-muted-foreground">
                Nu știm exact unde ești, iar o sesizare trebuie să aibă un loc
              </Text>
            </View>
          ) : (
            <SlideButton
              label={
                editing
                  ? "Glisează pentru a salva"
                  : "Glisează pentru a trimite"
              }
              onComplete={submit}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
