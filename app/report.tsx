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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/screen-header";
import { SlideButton } from "@/components/slide-button";
import { Input, TextArea } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { reportCategoryColor, reportCategoryIcon } from "@/constants/reports";
import { palette } from "@/constants/theme";
import { useCurrentLocation } from "@/hooks/use-current-location";
import { addReport, getReportById, updateReport } from "@/lib/api";
import { BUCHAREST, formatCoords } from "@/lib/geo";
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
    if (!perm.granted) return;
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.6,
    });
    if (!res.canceled) attach(res.assets.map((a) => a.uri));
  };

  const pickFromLibrary = async () => {
    haptics.selection();
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.6,
      allowsMultipleSelection: true,
      selectionLimit: room,
    });
    if (!res.canceled) attach(res.assets.map((a) => a.uri));
  };

  const removePhoto = (uri: string) => {
    haptics.selection();
    setPhotos((current) => current.filter((p) => p !== uri));
  };

  const submit = async () => {
    if (!category || submitting) return;
    setSubmitting(true);
    // The app resolves an IP-based fix (see lib/location.ts); fall back to the
    // Bucharest center if it hasn't landed yet so a report is never lost.
    const coords = location ?? BUCHAREST;
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
          latitude: coords.latitude,
          longitude: coords.longitude,
          plate: plate.trim() || undefined,
          note: note.trim() || undefined,
          photos: photos.length ? photos : undefined,
          address: location?.label,
        });
      }
      router.replace("/reports");
    } catch {
      haptics.warning();
      setSubmitting(false);
    }
  };

  /* Where the map preview points: the place being reported. On an edit that is
     where the report was filed, not where the phone is now. */
  const pin = edited ?? location ?? BUCHAREST;
  const placeLabel = editing
    ? (edited?.address ?? "Sesizarea originală")
    : (location?.label ?? "Se localizează…");

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
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
            <View className="gap-2.5">
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
                    className="flex-row items-center gap-3 rounded-lg p-3"
                    style={{
                      borderWidth: active ? 0 : StyleSheet.hairlineWidth,
                      borderColor: palette.border,
                      backgroundColor: active ? color + "14" : palette.card,
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <View
                      className="h-11 w-11 items-center justify-center rounded-full"
                      style={{ backgroundColor: color + "1F" }}
                    >
                      <Icon size={22} color={color} strokeWidth={2.1} />
                    </View>
                    <View className="flex-1">
                      <Text className="font-title text-sm text-foreground">
                        {c.label}
                      </Text>
                      <Text className="font-mid text-xs leading-4 text-muted-foreground">
                        {c.description}
                      </Text>
                    </View>
                    {active ? (
                      <View
                        className="h-6 w-6 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                    ) : (
                      <View className="h-6 w-6 rounded-full border-2 border-border" />
                    )}
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
                      style={{ backgroundColor: "rgba(20,20,22,0.7)" }}
                      accessibilityRole="button"
                      accessibilityLabel="Elimină fotografia"
                    >
                      <X size={15} color="#FFFFFF" strokeWidth={2.4} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}
            {room > 0 ? (
              <View className="flex-row gap-3">
                <Pressable
                  onPress={pickFromCamera}
                  className="flex-1 flex-row items-center justify-center gap-2 rounded-full border-hairline border-border bg-card py-3.5 active:opacity-80"
                >
                  <Camera size={20} color={palette.foreground} />
                  <Text className="font-semi text-sm text-foreground">
                    {photos.length ? "Încă o poză" : "Fă o poză"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={pickFromLibrary}
                  className="flex-1 flex-row items-center justify-center gap-2 rounded-full border-hairline border-border bg-card py-3.5 active:opacity-80"
                >
                  <ImageIcon size={20} color={palette.foreground} />
                  <Text className="font-semi text-sm text-foreground">Galerie</Text>
                </Pressable>
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
              <View pointerEvents="none" style={{ height: 130 }}>
                <MapView
                  provider={PROVIDER_DEFAULT}
                  style={{ flex: 1 }}
                  region={{
                    latitude: pin.latitude,
                    longitude: pin.longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }}
                  userInterfaceStyle="light"
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                >
                  <Marker
                    coordinate={{
                      latitude: pin.latitude,
                      longitude: pin.longitude,
                    }}
                    anchor={{ x: 0.5, y: 0.5 }}
                  >
                    <View
                      className="h-8 w-8 items-center justify-center rounded-full border-2 border-background"
                      style={{ backgroundColor: palette.destructive }}
                    >
                      <TriangleAlert size={16} color="#151517" strokeWidth={2.4} />
                    </View>
                  </Marker>
                </MapView>
              </View>
              <View className="flex-row items-center gap-2 px-4 py-3">
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
            </View>
          </View>

          {/* Submit */}
          {category ? (
            <SlideButton
              label={
                editing
                  ? "Glisează pentru a salva"
                  : "Glisează pentru a trimite"
              }
              onComplete={submit}
            />
          ) : (
            <View className="h-16 items-center justify-center rounded-full bg-secondary">
              <Text className="font-semi text-muted-foreground">
                Alege tipul de blocaj
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
