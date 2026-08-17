/**
 * Everything of yours this app is holding, and how to leave.
 *
 * Three lists and two buttons. The lists are what a person came to see -- the
 * complaints they filed and where each one got to, the places they put on the
 * map, and where they have parked -- and the buttons are the two rights that
 * act on all of it at once.
 *
 * WHAT USED TO BE HERE, AND WHY IT IS NOT. First a register of nine tables
 * with their retention periods, which answered "what does this company hold"
 * to somebody asking "what have I got here". Then a timeline of report events,
 * which the Sesizări tab already draws one screen away. Then the evidence
 * disclosure log, which is a real entitlement and reads on this screen as
 * somebody else's business rather than the driver's own things. All three are
 * still available in the export, which is the document that is meant to be
 * exhaustive; a screen is meant to be read.
 *
 * WHY THE PARKINGS ARE DELETABLE HERE AND THE REPORTS ARE NOT. A complaint is
 * evidence a sector hall may be acting on, and withdrawing it is a decision
 * with a screen of its own. A parking is a private note about where the car
 * is, nobody else can read one, and `parkings` in `0012` lets its author
 * delete any row -- so the bin is on the row, where the person looking at
 * their own movements can prune them without ceremony.
 *
 * WHY THE DELETION DIALOG LISTS WHAT SURVIVES. A confirmation that says "this
 * cannot be undone" has told the person the one thing they already assumed and
 * none of the things they have not. Three categories outlive this button --
 * the map keeps the places they contributed, other people's reports keep the
 * work they did on them, and a sector hall keeps the fact that it closed a
 * case -- and every one is a surprise waiting to happen if it is discovered
 * afterwards. So `whatErasureKeeps()` is read at the one moment it changes a
 * decision.
 *
 * WHY THE EXPORT WRITES A FILE. Article 20 asks for something portable, and a
 * screenful of JSON is not portable; it is a screenshot waiting to be taken.
 * The file goes through the share sheet, which is the one route on both
 * platforms to "put this in my email" and "save this to Files" without this
 * app needing an opinion about either.
 */

import { useFocusEffect, useRouter } from "expo-router";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  CarFront,
  Download,
  SquareParking,
  Trash2,
  TriangleAlert,
} from "lucide-react-native";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";

import { ReportStatusBadge } from "@/components/report-status-badge";
import { ScreenHeader } from "@/components/screen-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Screen } from "@/components/ui/screen";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { useColors } from "@/hooks/use-theme";
import { eraseMe, exportMyData, getReports, getSpots } from "@/lib/api";
import { sinceLabel } from "@/lib/bucharest-time";
import { resolveAccount } from "@/lib/identity";
import { forgetParking, loadParkings } from "@/lib/parkings";
import {
  exportFileName,
  exportLineLabel,
  exportToText,
  receiptLines,
  summariseExport,
  whatErasureKeeps,
} from "@/lib/privacy";
import { isRemote } from "@/lib/remote";
import { isMine } from "@/lib/report-view";
import { spotName } from "@/lib/spot-name";
import {
  REPORT_CATEGORIES,
  type BlockerReport,
  type Parking,
  type ParkingSpot,
} from "@/types";

/** What this screen has of the person's, once it has asked. */
interface Mine {
  reports: BlockerReport[];
  spots: ParkingSpot[];
  parkings: Parking[];
}

export default function PrivacyScreen() {
  const colors = useColors();
  const router = useRouter();
  const [busy, setBusy] = useState<"export" | "erase" | null>(null);
  const [mine, setMine] = useState<Mine | null>(null);

  const remote = isRemote();

  /* The account first, then everything keyed on it. Each list here is "yours"
     or nothing, and one built against a stale identity is somebody else's
     things drawn under this person's heading. */
  const load = useCallback(() => {
    resolveAccount()
      .then(async (account) => {
        const [reports, spots, parkings] = await Promise.all([
          getReports(),
          getSpots(),
          loadParkings(),
        ]);
        setMine({
          reports: reports.filter((report) => isMine(report, account)),
          spots: spots.filter(
            (spot) =>
              spot.ownerId === account.id || spot.createdBy === account.id,
          ),
          parkings,
        });
      })
      .catch((error) => {
        console.error("Could not load what is mine", error);
        setMine({ reports: [], spots: [], parkings: [] });
      });
  }, []);

  useFocusEffect(useCallback(() => load(), [load]));

  async function runExport() {
    setBusy("export");
    try {
      const dump = await exportMyData();
      if (!dump) {
        Alert.alert("Nimic de exportat", "Acest build nu trimite date nicăieri.");
        return;
      }

      const file = new File(Paths.cache, exportFileName());
      // Overwriting rather than appending: exporting twice in one day is a
      // person checking something changed, not asking for two documents.
      file.create({ overwrite: true });
      file.write(exportToText(dump));

      const lines = summariseExport(dump);
      const summary = lines.length
        ? lines.map(exportLineLabel).join("\n")
        : "Nu ai nimic salvat pe server.";

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "application/json",
          UTI: "public.json",
          dialogTitle: "Datele tale",
        });
        // After the sheet, not before: the counts are the receipt, and a
        // receipt shown while the share sheet is still up is a receipt nobody
        // sees.
        Alert.alert("Datele tale", summary);
      } else {
        Alert.alert("Datele tale", `${summary}\n\nFișier: ${file.uri}`);
      }
    } catch (error) {
      Alert.alert(
        "Nu am putut exporta",
        error instanceof Error ? error.message : "Încearcă din nou.",
      );
    } finally {
      setBusy(null);
    }
  }

  function confirmErase() {
    const survives = whatErasureKeeps()
      .map((category) => `• ${category.onErasure}`)
      .join("\n\n");

    Alert.alert(
      "Ștergi contul?",
      `Sesizările, pozele, parcările, locurile tale private și contul dispar definitiv.\n\nCe rămâne:\n\n${survives}`,
      [
        { text: "Renunț", style: "cancel" },
        { text: "Șterge tot", style: "destructive", onPress: runErase },
      ],
    );
  }

  async function runErase() {
    setBusy("erase");
    try {
      const receipt = await eraseMe();
      if (!receipt) {
        Alert.alert("Nimic de șters", "Acest build nu are cont pe server.");
        return;
      }

      const { abandonErasedSession } = await import("@/lib/account");
      await abandonErasedSession();

      Alert.alert("Contul a fost șters", receiptLines(receipt).join("\n"), [
        { text: "Am înțeles", onPress: () => router.replace("/") },
      ]);
    } catch (error) {
      Alert.alert(
        "Nu am putut șterge contul",
        error instanceof Error ? error.message : "Încearcă din nou.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <ScreenHeader title="Datele tale" />
      <ScrollView
        contentContainerClassName="gap-4 px-4 pb-10"
        showsVerticalScrollIndicator={false}
      >
        {remote ? (
          <Card className="gap-3 p-4">
            <Button
              label="Descarcă datele mele"
              rightIcon={<Download size={20} color={colors.primaryForeground} />}
              onPress={runExport}
              disabled={busy !== null}
              loading={busy === "export"}
            />
            {/* `card` rather than the yellow, and the label carries the red.
                There is no destructive variant and adding one for a single
                button would put a red fill in the component library that
                nothing else wants; what this needs is to look like the quieter
                of two choices while still reading as the dangerous one. */}
            <Button
              variant="card"
              onPress={confirmErase}
              disabled={busy !== null}
              loading={busy === "erase"}
            >
              <Trash2 size={20} color={colors.destructive} />
              <Text
                className="font-title text-base"
                style={{ color: colors.destructive }}
              >
                Șterge contul
              </Text>
            </Button>
          </Card>
        ) : (
          <Card className="p-4">
            {/* Same reasoning as the account screen: with no project there is
                no `auth.users` and nothing left this telephone, so there is
                nothing to export and no account to close. */}
            <Text className="font-mid text-xs text-muted-foreground">
              Fără cont pe acest build. Nimic nu a plecat de pe telefon.
            </Text>
          </Card>
        )}

        {remote ? (
          <Text className="px-2 font-mid text-[11px] leading-4 text-muted-foreground">
            Pozele și autentificarea se șterg în cel mult 30 de zile.
          </Text>
        ) : null}

        <Section title="Sesizările mele">
          {mine === null ? (
            <Loading />
          ) : mine.reports.length ? (
            mine.reports.map((report, index) => (
              <ReportRow key={report.id} report={report} first={!index} />
            ))
          ) : (
            <Empty>Nicio sesizare trimisă.</Empty>
          )}
        </Section>

        <Section title="Locurile mele">
          {mine === null ? (
            <Loading />
          ) : mine.spots.length ? (
            mine.spots.map((spot, index) => (
              <SpotRow key={spot.id} spot={spot} first={!index} />
            ))
          ) : (
            <Empty>Niciun loc adăugat de tine.</Empty>
          )}
        </Section>

        <Section title="Parcările mele">
          {mine === null ? (
            <Loading />
          ) : mine.parkings.length ? (
            mine.parkings.map((parking, index) => (
              <ParkingRow
                key={parking.id}
                parking={parking}
                first={!index}
                onForget={load}
              />
            ))
          ) : (
            <Empty>Nicio parcare. Apasă „Am parcat aici” pe un loc.</Empty>
          )}
        </Section>
      </ScrollView>
    </Screen>
  );
}

/** A heading and the card under it. The screen is three of these. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2.5">
      <Text className="px-1 font-title text-sm">{title}</Text>
      <Card className="overflow-hidden">{children}</Card>
    </View>
  );
}

function Loading() {
  return (
    <View className="items-center p-8">
      <Spinner size={28} />
    </View>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Text className="p-4 font-mid text-xs text-muted-foreground">{children}</Text>
  );
}

/**
 * One row, in the shape all three lists share.
 *
 * The hairline is drawn by the row rather than between them, so a list is a
 * `map` over its own data instead of a `map` interleaved with separators --
 * which is where the off-by-one lives every time this pattern is written by
 * hand.
 */
function Row({
  icon,
  tint,
  title,
  detail,
  right,
  onPress,
  first,
}: {
  icon: React.ReactNode;
  tint: string;
  title: string;
  detail?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  first: boolean;
}) {
  return (
    <View>
      {first ? null : <View className="mx-4 border-t-hairline border-border" />}
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={detail ? `${title}, ${detail}` : title}
        className="flex-row items-center gap-3 px-4 py-3.5 active:opacity-70"
      >
        <View
          className="h-9 w-9 items-center justify-center rounded-full"
          style={{ backgroundColor: tint + "1F", flexShrink: 0 }}
        >
          {icon}
        </View>
        <View className="flex-1 gap-0.5">
          <Text numberOfLines={1} className="font-title text-sm">
            {title}
          </Text>
          {detail ? (
            <Text numberOfLines={1} className="font-mid text-xs text-muted-foreground">
              {detail}
            </Text>
          ) : null}
        </View>
        {right}
      </Pressable>
    </View>
  );
}

/** A complaint, and the one thing the driver came to check: where it got to. */
function ReportRow({ report, first }: { report: BlockerReport; first: boolean }) {
  const colors = useColors();
  const router = useRouter();
  const label =
    REPORT_CATEGORIES.find((c) => c.key === report.category)?.label ??
    report.category;

  return (
    <Row
      first={first}
      icon={<TriangleAlert size={17} color={colors.foreground} strokeWidth={2.2} />}
      tint={colors.foreground}
      title={label}
      detail={sinceLabel(report.createdAt)}
      right={<ReportStatusBadge status={report.status} />}
      onPress={() =>
        router.push({ pathname: "/report-detail", params: { id: report.id } })
      }
    />
  );
}

/** A place this driver put on the map, or owns. */
function SpotRow({ spot, first }: { spot: ParkingSpot; first: boolean }) {
  const colors = useColors();
  const router = useRouter();

  return (
    <Row
      first={first}
      icon={<SquareParking size={17} color={colors.accent} strokeWidth={2.2} />}
      tint={colors.accent}
      title={spotName(spot)}
      detail={spot.area}
      onPress={() => router.push({ pathname: "/garage", params: { id: spot.id } })}
    />
  );
}

/**
 * One parking, with the bin that removes it.
 *
 * No confirmation. The row is a private note about where a car was left, the
 * person deleting it is the only one who can read it, and asking "sigur?"
 * before letting somebody forget where they parked treats their own memory as
 * something they need permission to prune.
 */
function ParkingRow({
  parking,
  first,
  onForget,
}: {
  parking: Parking;
  first: boolean;
  onForget: () => void;
}) {
  const colors = useColors();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function forget() {
    setBusy(true);
    try {
      await forgetParking(parking.id);
      onForget();
    } catch (error) {
      Alert.alert(
        "Nu am putut șterge",
        error instanceof Error ? error.message : "Încearcă din nou.",
      );
      setBusy(false);
    }
  }

  return (
    <Row
      first={first}
      icon={<CarFront size={17} color={colors.free} strokeWidth={2.2} />}
      tint={colors.free}
      title={parking.spotTitle ?? "Loc fără nume"}
      detail={sinceLabel(parking.at)}
      right={
        <Pressable
          onPress={forget}
          disabled={busy}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Șterge parcarea"
          className="p-1 active:opacity-60"
        >
          <Trash2 size={16} color={colors.mutedForeground} />
        </Pressable>
      }
      onPress={() =>
        router.push({ pathname: "/garage", params: { id: parking.spotId } })
      }
    />
  );
}
