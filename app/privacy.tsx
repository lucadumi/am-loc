/**
 * What the app knows about you, and how to make it stop.
 *
 * Two things a person can do and one long thing they can read, in that order
 * of prominence and the reverse order of importance -- the reading is what
 * makes the two buttons mean anything, and nobody reads it, so it goes
 * underneath where it can be found rather than on top where it is scrolled
 * past.
 *
 * WHY THE DELETION DIALOG LISTS WHAT SURVIVES. A confirmation that says "this
 * cannot be undone" has told the person the one thing they already assumed and
 * none of the things they have not. Three categories outlive this button --
 * the map keeps the places they contributed, other people's reports keep the
 * work they did on them, and a sector hall keeps the fact that it closed a
 * case -- and every one of those is a surprise waiting to happen if it is
 * discovered afterwards. So the dialog is the register, filtered.
 *
 * WHY THE EXPORT WRITES A FILE. Article 20 asks for something portable, and a
 * screenful of JSON is not portable; it is a screenshot waiting to be taken.
 * The file goes through the share sheet, which is the one route on both
 * platforms to "put this in my email" and "save this to Files" without this
 * app needing an opinion about either.
 */

import { useRouter } from "expo-router";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  CalendarClock,
  Download,
  Eye,
  FileWarning,
  Landmark,
  MapPin,
  ScrollText,
  Trash2,
  UserRound,
  Warehouse,
} from "lucide-react-native";
import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";

import { Divider, SettingRow } from "@/components/setting-row";
import { ScreenHeader } from "@/components/screen-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Screen } from "@/components/ui/screen";
import { Text } from "@/components/ui/text";
import { useColors } from "@/hooks/use-theme";
import { eraseMe, exportMyData } from "@/lib/api";
import {
  DATA_CATEGORIES,
  type DataCategory,
  exportFileName,
  exportLineLabel,
  exportToText,
  receiptLines,
  summariseExport,
  whatErasureKeeps,
} from "@/lib/privacy";
import { isRemote } from "@/lib/remote";

/** One icon per category, so the list is scannable before it is read. */
const CATEGORY_ICON: Record<string, typeof UserRound> = {
  reports: FileWarning,
  profile: UserRound,
  windows: CalendarClock,
  private_spots: Warehouse,
  public_spots: MapPin,
  actions: ScrollText,
  evidence_access: Eye,
  official_resolutions: Landmark,
  erasure_requests: Trash2,
};

/**
 * What a category's fate is called on screen.
 *
 * Deliberately three words rather than a tick and a cross. "Rămâne" and
 * "Rămâne, fără numele tău" are different answers and a two-state control
 * would have to pick one of them to lie about.
 */
const FATE_LABEL: Record<DataCategory["fate"], string> = {
  deleted: "Se șterge",
  severed: "Rămâne, anonim",
  kept: "Rămâne",
};

export default function PrivacyScreen() {
  const colors = useColors();
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<"export" | "erase" | null>(null);

  const remote = isRemote();

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
      `Sesizările, pozele, locurile tale private și contul dispar definitiv.\n\nCe rămâne:\n\n${survives}`,
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
            <Text className="font-title text-sm">Fără cont pe acest build</Text>
            <Text className="mt-1 font-mid text-xs text-muted-foreground">
              Nimic din ce ai scris nu a plecat de pe telefon.
            </Text>
          </Card>
        )}

        <Card className="overflow-hidden py-1">
          {DATA_CATEGORIES.map((category, index) => {
            const Icon = CATEGORY_ICON[category.key] ?? ScrollText;
            return (
              <View key={category.key}>
                {index > 0 ? <Divider /> : null}
                <SettingRow
                  icon={<Icon size={18} color={colors.accent} />}
                  title={category.what}
                  value={FATE_LABEL[category.fate]}
                  tint={
                    category.fate === "deleted" ? undefined : colors.mutedForeground
                  }
                  open={open === category.key}
                  onPress={() =>
                    setOpen(open === category.key ? null : category.key)
                  }
                >
                  <Text className="font-mid text-xs text-muted-foreground">
                    {category.kept}
                  </Text>
                  <Text className="font-mid text-xs text-foreground">
                    {category.onErasure}
                  </Text>
                </SettingRow>
              </View>
            );
          })}
        </Card>

        <Text className="px-2 font-mid text-[11px] leading-4 text-muted-foreground">
          Pozele și autentificarea nu se șterg în aceeași clipă cu rândurile:
          sunt în alte două sisteme și se curăță în cel mult 30 de zile.
        </Text>
      </ScrollView>
    </Screen>
  );
}
