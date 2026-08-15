import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Camera,
  Check,
  Lock,
  MapPin,
  Pencil,
  Send,
  UserCheck,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useState } from "react";
import { Alert, Image, ScrollView, View } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";

import { ReportStatusBadge } from "@/components/report-status-badge";
import { ScreenHeader } from "@/components/screen-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Screen } from "@/components/ui/screen";
import { TextArea } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { reportCategoryColor, reportCategoryIcon } from "@/constants/reports";
import { shadow } from "@/constants/theme";
import { useColors, useTheme } from "@/hooks/use-theme";
import { actOnReport, fetchEvidence, getReportById, signEvidence } from "@/lib/api";
import { sinceLabel } from "@/lib/bucharest-time";
import { formatCoords } from "@/lib/geo";
import { currentAccount, resolveAccount } from "@/lib/identity";
import { describeOrganisation, jurisdictionLabel } from "@/lib/jurisdiction";
import {
  isMine,
  mayEdit,
  mayViewEvidence,
  reportStatusMeaning,
} from "@/lib/report-view";
import { mayClearReport, mayResolveReport } from "@/lib/roles";
import { REPORT_CATEGORIES, type Account, type BlockerReport } from "@/types";

/**
 * One complaint, everything known about it, and what may be done next.
 *
 * THE SCREEN IS DIFFERENT FOR THREE PEOPLE and the differences are not
 * cosmetic. Its author sees their own photographs and may correct the
 * complaint. A warden whose office covers the place sees the evidence -- once,
 * on request, with the disclosure written into `evidence_access` -- and may
 * close the file. Everybody else sees the complaint and how much evidence
 * exists, and may say the kerb is clear.
 *
 * WHY THE EVIDENCE IS ASKED FOR RATHER THAN LOADED. A resolver's view of a
 * stranger's photographs is a disclosure of personal data and it is logged as
 * one. Fetching it with the screen would write an audit row every time
 * somebody scrolled past a complaint, which is a log nobody can read and
 * therefore a log that protects nobody. So it takes a deliberate tap, and the
 * button says what the tap does.
 */
export default function ReportDetailScreen() {
  const router = useRouter();
  const colors = useColors();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  // null = loading, undefined = no such report, object = resolved.
  const [report, setReport] = useState<BlockerReport | null | undefined>(null);
  const [account, setAccount] = useState<Account>(currentAccount());
  const [evidence, setEvidence] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  const reload = () => setRevision((n) => n + 1);

  useEffect(() => {
    if (!id) {
      setReport(undefined);
      return;
    }
    let alive = true;
    resolveAccount()
      .then((next) => {
        if (alive) setAccount(next);
        return getReportById(id);
      })
      .then((found) => {
        if (alive) setReport(found ?? undefined);
      })
      // `null` is the loading state, so a rejection left here would spin
      // forever. Resolving to "not found" at least ends the wait.
      .catch((error) => {
        console.error("Could not load the report", error);
        if (alive) setReport(undefined);
      });
    return () => {
      alive = false;
    };
  }, [id, revision]);

  /* The author's own photographs arrive with the report as storage paths and
     are signed for display. A resolver's do not arrive at all -- see
     `askForEvidence`. */
  useEffect(() => {
    const paths = report?.photos;
    if (!paths?.length || !report || !isMine(report, account)) return;

    let alive = true;
    signEvidence(paths)
      .then((urls) => {
        if (alive) setEvidence(urls);
      })
      .catch((error) => console.error("Could not sign the photos", error));
    return () => {
      alive = false;
    };
  }, [report, account]);

  const run = useCallback(
    (what: () => Promise<unknown>, done?: string) => {
      setBusy(true);
      what()
        .then(() => {
          if (done) Alert.alert(done);
          reload();
        })
        /* The database's own words. "Outside your jurisdiction" and "only a
           verified institution may resolve" are different problems with
           different fixes, and flattening them into "could not save" would
           leave a warden guessing which. */
        .catch((error: unknown) =>
          Alert.alert(
            "Nu a mers",
            error instanceof Error ? error.message : String(error),
          ),
        )
        .finally(() => setBusy(false));
    },
    [],
  );

  if (report === null) return <LoadingScreen />;

  if (report === undefined) {
    return (
      <Screen>
        <ScreenHeader title="Sesizare" />
        <View className="flex-1 items-center justify-center gap-3 px-10">
          <Text className="text-center font-title text-lg">
            Sesizarea nu mai există
          </Text>
          <Text className="text-center font-mid text-sm leading-5 text-muted-foreground">
            A fost retrasă de cine a trimis-o, sau nu a existat niciodată.
          </Text>
        </View>
      </Screen>
    );
  }

  const Icon = reportCategoryIcon[report.category];
  const tint = reportCategoryColor[report.category];
  const category = REPORT_CATEGORIES.find((c) => c.key === report.category);

  const mine = isMine(report, account);
  const photos = report.photoCount ?? report.photos?.length ?? 0;
  const canSeeEvidence = mayViewEvidence(report, account);
  const canResolve = mayResolveReport(account, report);

  /** A photograph of the clear kerb, which both closing acts cost. */
  const withProof = (
    kind: "cleared" | "resolved",
    done: string,
  ) => async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error(
        "Ca să confirmi că locul e liber, aplicația are nevoie de acces la cameră.",
      );
    }
    const shot = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (shot.canceled) return;

    await actOnReport({
      reportId: report.id,
      kind,
      photos: shot.assets.map((a) => a.uri),
    });
    Alert.alert(done);
  };

  const askForEvidence = () =>
    run(async () => {
      const urls = await fetchEvidence(report.id);
      setEvidence(urls);
    });

  return (
    <Screen>
      <ScreenHeader title="Sesizare" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        className="px-5"
      >
        <View className="gap-3 pb-4">
          <View className="flex-row items-center gap-3">
            <View
              className="h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: tint + "1F" }}
            >
              <Icon size={22} color={tint} strokeWidth={2.2} />
            </View>
            <View className="flex-1">
              <Text className="font-title text-lg">{category?.label}</Text>
              <Text className="font-mid text-xs text-muted-foreground">
                {sinceLabel(report.createdAt)}
                {report.sector ? ` · ${jurisdictionLabel[report.sector]}` : ""}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-2">
            <ReportStatusBadge status={report.status} />
            <Text className="flex-1 font-mid text-xs leading-4 text-muted-foreground">
              {reportStatusMeaning[report.status]}
            </Text>
          </View>
        </View>

        {/* Where it is. Read-only: a report's place is refused by a trigger on
            the table, because moving it would make the complaint a different
            complaint wearing the first one's history. */}
        <Card className="overflow-hidden">
          <View
            style={{ height: 150 }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <MapView
              provider={PROVIDER_DEFAULT}
              style={{ flex: 1 }}
              userInterfaceStyle={theme}
              pointerEvents="none"
              region={{
                latitude: report.latitude,
                longitude: report.longitude,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
              }}
            >
              <Marker
                coordinate={{
                  latitude: report.latitude,
                  longitude: report.longitude,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View
                  className="h-9 w-9 items-center justify-center rounded-full border-2 border-background"
                  style={{ backgroundColor: colors.destructive, ...shadow.marker }}
                >
                  <Icon size={17} color={colors.card} strokeWidth={2.4} />
                </View>
              </Marker>
            </MapView>
          </View>
          <View
            className="flex-row items-center gap-2 px-4 py-3"
            accessible
            accessibilityLabel={`Locul sesizării: ${report.address ?? formatCoords(report.latitude, report.longitude)}`}
          >
            <MapPin size={16} color={colors.mutedForeground} />
            <Text numberOfLines={1} className="flex-1 font-mid text-sm">
              {report.address ?? "Loc nedenumit"}
            </Text>
            <Text className="font-mid text-xs text-muted-foreground">
              {formatCoords(report.latitude, report.longitude)}
            </Text>
          </View>
        </Card>

        {report.note ? (
          <Card className="mt-3 p-4">
            <Text className="font-mid text-sm leading-5">{report.note}</Text>
          </Card>
        ) : null}

        <Evidence
          count={photos}
          urls={evidence}
          mine={mine}
          allowed={canSeeEvidence}
          busy={busy}
          plate={report.plate}
          onAsk={askForEvidence}
        />

        <History report={report} />

        <View className="mt-6 gap-2.5">
          {mayEdit(report, account) ? (
            <Button
              variant="card"
              onPress={() =>
                router.push({ pathname: "/report", params: { id: report.id } })
              }
            >
              <Pencil size={18} color={colors.foreground} />
              <Text className="font-title text-base">Corectează sesizarea</Text>
            </Button>
          ) : null}

          {/* Anybody may say a kerb is clear, and it costs a photograph -- the
              same price the complaint cost. Not offered on one already
              settled: the next person to look files a new report rather than
              arguing with the last observation. */}
          {!mine && report.status !== "cleared" && report.status !== "resolved" && mayClearReport(account) ? (
            <Button
              variant="card"
              loading={busy}
              onPress={() =>
                run(withProof("cleared", "Mulțumim. Am notat că locul e liber."))
              }
            >
              <UserCheck size={18} color={colors.foreground} />
              <Text className="font-title text-base">Locul e liber acum</Text>
            </Button>
          ) : null}

          {canResolve ? (
            <ResolverActions
              report={report}
              account={account}
              busy={busy}
              run={run}
              withProof={withProof}
            />
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

/**
 * The photographs, or the reason there are none to show.
 *
 * Four states and they say four different things. The author sees theirs. A
 * warden sees a button that fetches them and says so. Everybody else is told
 * how many exist and that they are private -- which is the honest replacement
 * for the redacted preview the issue asks for: there is nothing here that can
 * blur a number plate, and a preview published as redacted that is not is
 * worse than none, because the driver believes the app protected them.
 */
function Evidence({
  count,
  urls,
  mine,
  allowed,
  busy,
  plate,
  onAsk,
}: {
  count: number;
  urls: string[] | null;
  mine: boolean;
  allowed: boolean;
  busy: boolean;
  plate?: string;
  onAsk: () => void;
}) {
  const colors = useColors();

  if (!count) return null;

  return (
    <View className="mt-3 gap-2.5">
      <View className="flex-row items-center gap-2">
        <Camera size={16} color={colors.mutedForeground} />
        <Text className="font-title text-sm">
          {count === 1 ? "1 fotografie" : `${count} fotografii`}
        </Text>
        {plate ? (
          <Text className="font-mid text-xs text-muted-foreground">
            · {plate}
          </Text>
        ) : null}
      </View>

      {urls?.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10 }}
        >
          {urls.map((uri, index) => (
            <Image
              key={uri}
              source={{ uri }}
              style={{ width: 132, height: 132, borderRadius: 12 }}
              resizeMode="cover"
              accessible
              accessibilityLabel={`Fotografia ${index + 1} din ${urls.length}`}
            />
          ))}
        </ScrollView>
      ) : mine ? (
        <View className="h-32 rounded-xl bg-secondary" />
      ) : allowed ? (
        <>
          <Button
            size="sm"
            variant="secondary"
            label="Vezi dovezile"
            loading={busy}
            onPress={onAsk}
          />
          {/* Said before the tap, not after. Somebody about to look at a
              stranger's number plate should know it is recorded that they
              did. */}
          <Text className="font-mid text-xs leading-4 text-muted-foreground">
            Accesul la dovezi este înregistrat.
          </Text>
        </>
      ) : (
        <View className="flex-row items-center gap-2 rounded-xl bg-secondary px-4 py-3">
          <Lock size={15} color={colors.mutedForeground} />
          <Text className="flex-1 font-mid text-xs leading-4 text-muted-foreground">
            Fotografiile conțin numere de înmatriculare și rămân doar la cine a
            trimis sesizarea și la instituția care o preia.
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * Everything that happened to this complaint, newest first.
 *
 * A single "resolved by X" line was the first attempt and loses the thing a
 * complainant actually wants to know: whether anybody did anything, and when.
 * A report forwarded on Monday and closed on Thursday is a different story
 * from one closed the same afternoon, and the difference is invisible if only
 * the last step is drawn.
 *
 * Attribution is the office rather than the person, wherever there is one. An
 * official act belongs to the sector hall; naming the warden would attribute a
 * public act to a private individual, and a resolver is whoever sits at that
 * desk this month.
 */
function History({ report }: { report: BlockerReport }) {
  const colors = useColors();
  const events = report.history;
  if (!events?.length) return null;

  const say = {
    forwarded: "Preluată de o instituție",
    cleared: "Cineva a văzut locul liber",
    resolved: "Închisă de o instituție",
  };
  const icon = {
    forwarded: Send,
    cleared: UserCheck,
    resolved: Check,
  };
  const tint = {
    forwarded: colors.accent,
    cleared: colors.leaving,
    resolved: colors.free,
  };

  return (
    <View className="mt-6 gap-2.5">
      <Text className="font-title text-sm">Ce s-a întâmplat</Text>
      <Card className="overflow-hidden">
        {events.map((event, index) => {
          const Icon = icon[event.kind];
          return (
            <View key={event.id}>
              {index ? (
                <View className="mx-4 border-t-hairline border-border" />
              ) : null}
              <View className="flex-row items-start gap-3 px-4 py-3.5">
                <View
                  className="h-8 w-8 items-center justify-center rounded-full bg-secondary"
                  style={{ flexShrink: 0 }}
                >
                  <Icon size={15} color={tint[event.kind]} strokeWidth={2.4} />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text className="font-title text-sm">{say[event.kind]}</Text>
                  <Text className="font-mid text-xs text-muted-foreground">
                    {event.organisation ? `${event.organisation} · ` : ""}
                    {sinceLabel(event.at)}
                  </Text>
                  {/* An institution's own words, where it left any. Shown to
                      everybody: a complainant told what was ordered has an
                      answer, and one told only "closed" has a shrug. */}
                  {event.note ? (
                    <Text className="mt-0.5 font-mid text-xs leading-4 text-muted-foreground">
                      {event.note}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          );
        })}
      </Card>
    </View>
  );
}

/**
 * What a warden may do, and the note that goes with it.
 *
 * Forwarding is paperwork in motion and costs nothing. Resolving costs a
 * photograph, the same price the complaint cost -- a blockage that "was
 * resolved" because somebody tapped a button is the one claim nobody can check
 * afterwards, because the car has gone either way.
 */
function ResolverActions({
  report,
  account,
  busy,
  run,
  withProof,
}: {
  report: BlockerReport;
  account: Account;
  busy: boolean;
  run: (what: () => Promise<unknown>, done?: string) => void;
  withProof: (
    kind: "cleared" | "resolved",
    done: string,
  ) => () => Promise<void>;
}) {
  const colors = useColors();
  const [note, setNote] = useState("");
  const office = account.organisation;

  if (report.status === "resolved") return null;

  return (
    <View className="mt-4 gap-2.5">
      <Text className="font-title text-sm">
        {office ? describeOrganisation(office) : "Instituție"}
      </Text>

      <TextArea
        accent
        value={note}
        onChangeText={setNote}
        placeholder="Notă internă: număr de înregistrare, ce s-a dispus…"
        maxLength={500}
        accessibilityLabel="Notă instituțională"
      />

      {report.status !== "forwarded" ? (
        <Button
          variant="card"
          loading={busy}
          onPress={() =>
            run(
              () =>
                actOnReport({
                  reportId: report.id,
                  kind: "forwarded",
                  note: note.trim() || undefined,
                }),
              "Sesizarea a fost preluată.",
            )
          }
        >
          <Send size={18} color={colors.foreground} />
          <Text className="font-title text-base">Preia sesizarea</Text>
        </Button>
      ) : null}

      <Button
        loading={busy}
        onPress={() =>
          run(withProof("resolved", "Sesizarea a fost închisă."))
        }
      >
        <Check size={18} color={colors.primaryForeground} />
        <Text className="font-title text-base text-primary-foreground">
          Închide cu fotografie
        </Text>
      </Button>
    </View>
  );
}
