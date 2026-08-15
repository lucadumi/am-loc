import { useFocusEffect, useRouter } from "expo-router";
import { Inbox, TriangleAlert } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ReportCard } from "@/components/report-card";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Screen } from "@/components/ui/screen";
import { Text } from "@/components/ui/text";
import { floatingTabBarInset } from "@/constants/layout";
import { useColors } from "@/hooks/use-theme";
import { useLive } from "@/hooks/use-live";
import { getReports } from "@/lib/api";
import { currentAccount, resolveAccount } from "@/lib/identity";
import { describeOrganisation } from "@/lib/jurisdiction";
import {
  compareForReader,
  inboxFor,
  isMine,
  unsettledCount,
} from "@/lib/report-view";
import { holds } from "@/lib/roles";
import type { Account, BlockerReport } from "@/types";

/**
 * The complaints, and what happened to them.
 *
 * This screen is the reason the reporting flow was worth building. A driver
 * could photograph a blocked pavement, place it on a map, sign a slide and
 * send it -- and then had nowhere to see it, not even their own. The card
 * after filing says "apare pe hartă pentru toți șoferii din zonă", which was
 * true and unverifiable.
 *
 * THREE LISTS OR TWO, DEPENDING ON WHO IS LOOKING. Everybody gets "toate" and
 * "ale mele". A resolver acting for an office gets a third, and it is first,
 * because somebody who opened the app to work should not have to find their
 * own work behind the public feed.
 *
 * What a stranger sees of somebody else's complaint is the complaint: what was
 * blocked, where, when, and where it got to. Not the photographs and not the
 * number plate -- neither is available to draw, because the schema hands them
 * to the author alone. See `lib/report-view.ts`.
 */

type Tab = "inbox" | "all" | "mine";

export default function ReportsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [reports, setReports] = useState<BlockerReport[] | null>(null);
  const [account, setAccount] = useState<Account>(currentAccount());
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("all");

  const load = useCallback(() => {
    setFailed(false);
    /* The account first and the reports after it. Everything on this screen
       turns on who is asking -- which list exists, which card is mine, which
       report I may act on -- and a list rendered against a stale identity
       shows a driver somebody else's answers for a frame. */
    resolveAccount()
      .then((next) => {
        setAccount(next);
        return getReports();
      })
      .then((loaded) => setReports(loaded))
      .catch((error) => {
        console.error("Could not load reports", error);
        setReports([]);
        setFailed(true);
      });
  }, []);

  useFocusEffect(useCallback(() => load(), [load]));

  /* A complaint somebody else forwards or closes is news to whoever is
     watching this list, which is the whole reason it is worth being live. */
  useLive("reports", load);

  if (reports === null) return <LoadingScreen />;

  const office = holds(account, "resolver") ? account.organisation : undefined;
  const inbox = office ? inboxFor(reports, account) : [];
  const mine = reports.filter((report) => isMine(report, account));

  /* The resolver's own list is chosen for them on arrival, and only on the
     first render -- `tab` is state, so a warden who taps "toate" stays there.
     Landing them on the public feed would be handing somebody at work the
     newspaper. */
  const shown =
    tab === "inbox" ? inbox : tab === "mine" ? mine : [...reports].sort(compareForReader);

  const tabs: { key: Tab; label: string }[] = [
    ...(office
      ? [{ key: "inbox" as const, label: `De preluat (${unsettledCount(inbox)})` }]
      : []),
    { key: "all", label: "Toate" },
    { key: "mine", label: `Ale mele (${mine.length})` },
  ];

  return (
    <Screen>
      <View className="gap-3 px-5 pb-3 pt-2">
        <Text className="font-title text-2xl">Sesizări</Text>

        {/* Said once, at the top, for the person it applies to. A warden needs
            to know which office the app thinks they are before they act on
            anything in its name. */}
        {office ? (
          <Text className="font-mid text-xs text-muted-foreground">
            {describeOrganisation(office)}
          </Text>
        ) : null}

        <Segmented
          value={tab}
          onChange={setTab}
          options={tabs}
        />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: floatingTabBarInset(insets.bottom) + 12,
          flexGrow: 1,
        }}
        className="px-5"
      >
        {shown.length ? (
          <View className="gap-2.5">
            {shown.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                onPress={() =>
                  router.push({
                    pathname: "/report-detail",
                    params: { id: report.id },
                  })
                }
              />
            ))}
          </View>
        ) : (
          <Empty tab={tab} failed={failed} onRetry={load} />
        )}
      </ScrollView>
    </Screen>
  );
}

/**
 * Nothing to show, and which nothing it is.
 *
 * Four different absences with four different meanings, and the reason they
 * are not one message: "no reports" on the public feed means nobody in the
 * city has filed anything, on `mine` it means the driver has not, and on the
 * inbox it means the office is up to date -- which is good news drawn the same
 * way as bad. A single "nimic aici" would say all four.
 */
function Empty({
  tab,
  failed,
  onRetry,
}: {
  tab: Tab;
  failed: boolean;
  onRetry: () => void;
}) {
  const colors = useColors();

  if (failed) {
    return (
      <View className="flex-1 items-center justify-center gap-4 px-8">
        <Text className="text-center font-title text-lg">
          Nu am putut încărca sesizările
        </Text>
        <Button label="Încearcă din nou" onPress={onRetry} />
      </View>
    );
  }

  const { Icon, title, detail } = {
    inbox: {
      Icon: Inbox,
      title: "Nimic de preluat",
      detail: "Nicio sesizare deschisă în jurisdicția ta.",
    },
    all: {
      Icon: TriangleAlert,
      title: "Nicio sesizare încă",
      detail: "Când cineva raportează un blocaj, apare aici.",
    },
    mine: {
      Icon: TriangleAlert,
      title: "Nu ai trimis nicio sesizare",
      detail: "O mașină pe trotuar, pe rampă sau pe trecere se raportează din +.",
    },
  }[tab];

  return (
    <View className="flex-1 items-center justify-center gap-3 px-10">
      <View className="h-20 w-20 items-center justify-center rounded-full bg-secondary">
        <Icon size={34} color={colors.mutedForeground} strokeWidth={1.8} />
      </View>
      <Text className="text-center font-title text-lg">{title}</Text>
      <Text className="text-center font-mid text-sm leading-5 text-muted-foreground">
        {detail}
      </Text>
    </View>
  );
}
