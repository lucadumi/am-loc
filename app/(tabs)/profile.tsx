import { useFocusEffect, useRouter } from "expo-router";
import {
  Bookmark,
  Building2,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  KeyRound,
  LogOut,
  Mail,
  ShieldCheck,
  SquareParking,
  Store,
  TriangleAlert,
  UserRound,
} from "lucide-react-native";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Banner } from "@/components/banner";
import { SectionHeader } from "@/components/section-header";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Screen } from "@/components/ui/screen";
import { Text } from "@/components/ui/text";
import { floatingTabBarInset } from "@/constants/layout";
import { useColors } from "@/hooks/use-theme";
import {
  THEME_CHOICES,
  themeChoiceIcon,
  themeChoiceLabel,
  useThemeChoice,
} from "@/hooks/use-theme-choice";
import { getReports, tallyReports, type ReportTally } from "@/lib/api";
import { resolveAccount } from "@/lib/identity";
import { isRemote } from "@/lib/remote";
import {
  blockedByAssurance,
  canEnrolSecondFactor,
  canPassSecondFactor,
  effectiveRoles,
  primaryRole,
  roleLabel,
  type Account,
  type AccountRole,
} from "@/lib/roles";

/**
 * Who you are, and what this app will let you be.
 *
 * BUILT ON THE HOME SCREEN'S SHAPE, and not for decoration. The yellow hero
 * that bleeds up behind the clock, and the white card straddling the seam
 * where it ends, are how this app says "this page is about you and here is the
 * thing to act on" -- the home screen makes that shape with a greeting and the
 * category box. A settings list on a flat grey canvas is what every other
 * screen in this app is deliberately not, and drawing the account that way
 * made the one screen carrying the brand's own promise look like it had been
 * borrowed from a different application.
 *
 * The screen exists to make one promise visible: signing up costs a driver
 * nothing. Everything filed from this phone was already filed under a real
 * uuid in `auth.users`, and attaching an email keeps that uuid — so the line
 * about keeping your reports is true structurally rather than reassuringly.
 * See the header of `lib/account.ts`.
 *
 * Three states, and they are states of the account rather than tabs:
 *
 *   ANONYMOUS — has reports, has no way back into them. Mostly the sign-up
 *   form, because that is the one thing worth doing here.
 *
 *   SIGNED UP — has an email. Can name themselves, declare that they trade,
 *   and add a second factor.
 *
 *   HOLDING A PRIVILEGED GRANT AT aal1 — a resolver who signed in with only a
 *   password. Drawn as a prompt rather than as missing buttons: a role that is
 *   present and unusable looks exactly like one that was taken away, and the
 *   person would ask why their access had gone instead of typing six digits.
 */

/** The hairline between two rows, inset so it does not touch the card's edge. */
function Divider() {
  return <View className="mx-4 border-t-hairline border-border" />;
}

/**
 * A setting, as a row that opens where it stands.
 *
 * The shape the rest of the app already uses for "a thing with a current value
 * that you can go and change": an icon in a disc, what it is, what it says
 * right now, and a chevron. The home screen's "Ultima parcare" row is the same
 * object.
 *
 * IT OPENS INLINE RATHER THAN PUSHING A SCREEN, and that is the point of the
 * rewrite. Laid out flat, these three settings were three headings, two naked
 * text fields, a switch and four paragraphs of explanation -- a page of forms
 * for things a driver touches once a year, in front of the one fact they came
 * to check. Collapsed, the whole account is four rows deep, and the explaining
 * happens only where somebody has asked to read it.
 */
function SettingRow({
  icon,
  title,
  value,
  tint,
  open,
  onPress,
  right,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  /** What it says right now. The reason the row is worth reading closed. */
  value?: string;
  /** Colours the value where it is a state that wants attention. */
  tint?: string;
  open?: boolean;
  onPress?: () => void;
  /** A control that belongs on the row itself, for a setting with two states. */
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const colors = useColors();
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <View>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? "button" : undefined}
        className="flex-row items-center gap-3 px-4 py-3.5 active:opacity-70"
      >
        <View className="h-9 w-9 items-center justify-center rounded-full bg-secondary">
          {icon}
        </View>
        <Text className="flex-1 font-title text-sm">{title}</Text>
        {value ? (
          <Text
            numberOfLines={1}
            className="max-w-[45%] font-mid text-xs text-muted-foreground"
            style={tint ? { color: tint } : undefined}
          >
            {value}
          </Text>
        ) : null}
        {right ?? (
          onPress ? <Chevron size={18} color={colors.mutedForeground} /> : null
        )}
      </Pressable>
      {open && children ? (
        <View className="gap-3 px-4 pb-4">{children}</View>
      ) : null}
    </View>
  );
}

const roleIcon: Record<AccountRole, typeof UserRound> = {
  user: UserRound,
  host: Store,
  resolver: Building2,
  admin: ShieldCheck,
};

/**
 * One of the roles this account may act as.
 *
 * A row inside one card rather than a card of its own. Three stacked cards
 * gave three separate surfaces equal weight, which read as three things to
 * do; they are one answer to one question, and a list is what an answer with
 * several parts looks like.
 */
function RoleRow({ role }: { role: AccountRole }) {
  const colors = useColors();
  const Icon = roleIcon[role];
  return (
    <View className="flex-row items-center gap-3 px-4 py-3.5">
      <View className="h-9 w-9 items-center justify-center rounded-full bg-secondary">
        <Icon size={18} color={colors.foreground} />
      </View>
      <Text className="flex-1 font-title text-sm">{roleLabel[role]}</Text>
    </View>
  );
}

/**
 * The heading of a form inside the straddling card.
 *
 * Not `SectionHeader`, which is sized for the grey canvas and carries an
 * optional action button these forms have no use for.
 *
 * Every form uses it, which is the point: "Fă-ți cont" was written by hand at
 * `text-2xl` while "Intră în cont" went through here at `text-base`, so the
 * same card changed the size of its own title depending on which of two links
 * had been tapped. A heading with one spelling cannot do that.
 */
function FormTitle({ children }: { children: React.ReactNode }) {
  return <Text className="font-title text-xl">{children}</Text>;
}

/** The month a driver joined, for the third figure. `2026-08` reads as `aug. 2026`. */
function monthOf(iso: string): string {
  return new Date(iso)
    .toLocaleDateString("ro-RO", { month: "short", year: "numeric" })
    .replace(".", "");
}

/** One figure in the strip: the number, then what it counts. */
function Figure({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <View className="flex-1 items-center gap-1 py-4">
      {icon}
      <Text className="font-heavy text-xl">{value}</Text>
      <Text numberOfLines={1} className="font-mid text-xs text-muted-foreground">
        {label}
      </Text>
    </View>
  );
}

/**
 * What this driver has actually done, across the seam.
 *
 * The straddling card is where the home screen puts the thing worth acting on,
 * and on a profile that is not the email address -- it is the only content on
 * this page the driver made themselves. It is also what turns the sign-up
 * offer from a request into an argument: "patru sesizări" is the thing an
 * account keeps, and a page that asked for an address without ever naming what
 * was at stake was asking on the app's behalf rather than on theirs.
 *
 * Vertical dividers rather than three cards, so the three read as one answer.
 */
function Activity({
  tally,
  since,
}: {
  tally: ReportTally;
  /** Absent with no project, or before the profiles migration has been run. */
  since?: string;
}) {
  const colors = useColors();
  return (
    <View className="flex-row">
      <Figure
        icon={<TriangleAlert size={18} color={colors.accent} />}
        value={String(tally.filed)}
        label={tally.filed === 1 ? "sesizare" : "sesizări"}
      />
      <View className="my-4 border-l-hairline border-border" />
      <Figure
        icon={<CheckCheck size={18} color={colors.free} />}
        value={String(tally.resolved)}
        label="rezolvate"
      />
      {since ? (
        <>
          <View className="my-4 border-l-hairline border-border" />
          <Figure
            icon={<UserRound size={18} color={colors.mutedForeground} />}
            value={monthOf(since)}
            label="din"
          />
        </>
      ) : null}
    </View>
  );
}

/** What a screen hands its forms so they can run an action and show a failure. */
type Run = (what: () => Promise<Account | void>) => void;

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  /* Counted from the same reports the Sesizări tab lists, so the two cannot
     disagree. Starts at zero rather than null: the strip is not worth a
     spinner, and "0 sesizări" is the true answer for most drivers opening this
     page for the first time. */
  const [tally, setTally] = useState<ReportTally>({ filed: 0, resolved: 0 });
  /* Separate from `account === null`, which is the loading state. Resolving
     who we are is a network call, and it throws on a project with anonymous
     sign-ins switched off as well as on a phone in a tunnel -- so a rejection
     left to itself would leave this tab spinning forever with nothing to read
     and nothing to press. */
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    resolveAccount()
      .then((next) => {
        setAccount(next);
        /* After the account, not beside it: the tally is counted against an
           identity, and counting against a stale one would show a driver
           somebody else's total for a frame. Its own failure is not the
           screen's -- the account still renders, with nothing counted. */
        return getReports()
          .then((reports) => setTally(tallyReports(reports, next.id)))
          .catch((error) => console.error("Could not count reports", error));
      })
      .catch((error) => {
        console.error("Could not load the account", error);
        setFailed(true);
      });
  }, []);

  useFocusEffect(useCallback(() => load(), [load]));

  /**
   * Run something that changes the account, and say what went wrong.
   *
   * Every failure here is one a person can act on — a code that has expired,
   * an address already in use, a password too short — so none are swallowed.
   * `busy` locks the whole screen rather than one button: confirming a sign-up
   * while a sign-in is in flight would race two sessions against each other.
   */
  const run: Run = (what) => {
    setBusy(true);
    what()
      .then((next) => {
        if (next) setAccount(next);
      })
      .catch((error: unknown) => {
        Alert.alert(
          "Nu a mers",
          error instanceof Error ? error.message : String(error),
        );
        /* Re-read rather than keep what is on screen. Several of these calls
           change the account before failing -- confirming an address and then
           failing to set a password is the important one -- and a screen still
           drawing the state from before would offer the step that has already
           happened instead of the one that has not. */
        load();
      })
      .finally(() => setBusy(false));
  };

  if (failed && !account) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-4 px-10">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-secondary">
            <UserRound size={36} color={colors.mutedForeground} />
          </View>
          <Text className="text-center font-title text-lg">
            Nu am putut încărca contul
          </Text>
          <Button label="Încearcă din nou" onPress={load} />
        </View>
      </Screen>
    );
  }

  if (!account) return <LoadingScreen />;

  const roles = effectiveRoles(account);
  const blocked = blockedByAssurance(account);
  const initial = (account.displayName?.trim()[0] ?? "Ș").toUpperCase();

  /* A badge, and only when there is a badge to wear. Everybody is a `Șofer`,
     so a chip saying so under a name is decoration -- and the states that are
     not finished say what they are in the card below, as a heading over the
     field that fixes them, which is where somebody can act on it. */
  const role = primaryRole(account);
  const badge = role === "user" ? null : roleLabel[role];

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: floatingTabBarInset(insets.bottom) + 12,
        }}
      >
        {/* Yellow bleed, so the overscroll bounce at the top stays yellow
            instead of flashing the grey canvas. The home screen's hero does
            the same. */}
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

        {/* The hero. `paddingTop` paints the status-bar inset itself, which is
            what lets the yellow run up behind the clock. */}
        <View
          style={{ paddingTop: insets.top + 12 }}
          /* `pb` minus the card's own -52 is the air between the name and the
             thing that overlaps it. At 60 that was eight pixels and the card
             read as resting on the name. */
          className="items-center gap-2 bg-primary px-5 pb-[84px]"
        >
          {/* Inverted against the hero: white disc, yellow initial. The same
              swap `GreetingHeader` makes for its avatar when it sits on the
              primary surface, so the two read as the same person. */}
          <View className="h-24 w-24 items-center justify-center rounded-full bg-primary-foreground">
            <Text className="font-heavy text-3xl text-primary">{initial}</Text>
          </View>
          <Text className="font-title text-2xl text-primary-foreground">
            {account.displayName ?? "Șofer"}
          </Text>
          {/* `muted` rather than `card`: the chip surface that exists for
              exactly this, because pure white on the brand yellow shouts. */}
          {badge ? (
            <Chip size="sm" surface="muted">
              <Text className="font-semi text-xs text-foreground">{badge}</Text>
            </Chip>
          ) : null}
        </View>

        <View className="flex-1 bg-background">
          {/* The card straddling the seam, carrying whatever this account most
              needs next: a form while there is one to fill in, the account's
              own facts once there is not. */}
          <View
            style={{ marginTop: -52 }}
            className="mx-5 overflow-hidden rounded-xl border-hairline border-border bg-card"
          >
            {account.passwordPending ? (
              <FinishSignUp account={account} busy={busy} run={run} />
            ) : account.anonymous ? (
              <Anonymous busy={busy} run={run} tally={tally} />
            ) : (
              <Activity tally={tally} since={account.since} />
            )}
          </View>

          {/* The one thing this page can ask for that is worth asking. The
              screen behind it refuses an anonymous account, which is the
              honest place for that refusal rather than a row that is quietly
              absent from the list below. */}
          <Banner
            className="mt-7"
            image={require("../../assets/images/interior-parking.jpg")}
            label="Ai un loc de parcare? Listează-l"
            onPress={() => router.push("/add-spot")}
          />

          {/* Everything of the driver's own, in one place. No counts on the
              rows: the figures above already carry the one number worth
              stating, and repeating it a centimetre lower would make the strip
              a heading for the list rather than a fact in its own right. */}
          <View className="mt-7 px-5">
            <Card className="overflow-hidden">
              <SettingRow
                icon={<TriangleAlert size={16} color={colors.foreground} />}
                title="Sesizările mele"
                onPress={() => router.push("/reports")}
              />
              <Divider />
              <SettingRow
                icon={<Bookmark size={16} color={colors.foreground} />}
                title="Salvate"
                onPress={() => router.push("/archived")}
              />
              <Divider />
              <SettingRow
                icon={<SquareParking size={16} color={colors.foreground} />}
                title="Locurile mele"
                onPress={() => router.push("/my-spots")}
              />
            </Card>
          </View>

          {/* Above the account, and drawn for everybody. It is the one setting
              here that is not about who you are -- an anonymous driver has as
              much use for a dark map at night as a signed-in one. */}
          <View className="mt-7 gap-3 px-5">
            <SectionHeader title="Aspect" />
            <ThemeSetting />
          </View>

          {/* A privileged grant this session cannot use comes before anything
              else: nothing here matters to somebody who opened the app to work
              and found their access suspended. */}
          {blocked.length ? (
            <View className="mt-7 px-5">
              <SecondFactorPrompt
                roles={blocked}
                busy={busy}
                onSubmit={(code) =>
                  run(async () => {
                    const { passSecondFactor } = await import("@/lib/account");
                    return passSecondFactor(code);
                  })
                }
              />
            </View>
          ) : null}

          {/* Only when there is something to say. Everybody is a `user`, so a
              one-line list reading "Șofer" is a section telling a driver what
              they already know in exchange for a third of the screen. It
              appears the day somebody is granted a role, and not before. */}
          {roles.length > 1 ? (
            <View className="mt-7 gap-3 px-5">
              <SectionHeader title="Ce poți face" />
              <Card className="overflow-hidden">
                {roles.map((role, index) => (
                  <View key={role}>
                    {index ? <Divider /> : null}
                    <RoleRow role={role} />
                  </View>
                ))}
              </Card>
            </View>
          ) : null}

          {account.passwordPending || account.anonymous ? null : (
            <SignedIn account={account} busy={busy} run={run} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}


/**
 * Light, dark, or whatever the phone is doing.
 *
 * A segmented control rather than a switch, because there are three answers
 * and "system" is one of them -- a two-state toggle would force a driver to
 * pick a theme and stop following their own phone, which is the setting most
 * of them want and none of them would choose from a list of two.
 *
 * `Segmented` already carries the radio roles and the selected state a reader
 * needs; this only has to hand it the options.
 */
function ThemeSetting() {
  const { choice, setChoice } = useThemeChoice();

  /* Nothing until the stored answer is known. A control that drew "Sistem"
     selected and corrected itself a beat later would be showing the driver a
     setting they did not choose, in the one place they came to change it. */
  if (!choice) return <View className="h-11" />;

  return (
    <Segmented
      value={choice}
      onChange={setChoice}
      options={THEME_CHOICES.map((key) => ({
        key,
        label: themeChoiceLabel[key],
        icon: themeChoiceIcon[key],
      }))}
    />
  );
}

/** Signing up, or signing into an account made on another phone. */
function Anonymous({
  busy,
  run,
  tally,
}: {
  busy: boolean;
  run: Run;
  tally: ReportTally;
}) {
  const [signingIn, setSigningIn] = useState(false);

  if (!isRemote()) {
    return (
      <View className="p-5">
        {/* With no project configured there is no `auth.users` to hold an
            account, and everything filed lives in AsyncStorage on this
            device. See lib/remote.ts. */}
        <FormTitle>Fără cont pe acest build</FormTitle>
      </View>
    );
  }

  if (signingIn) {
    return <SignIn busy={busy} run={run} onCancel={() => setSigningIn(false)} />;
  }

  return (
    <>
      {/* The figures above the form, and this order is the argument: what an
          account keeps is the thing directly above the field asking for one.
          Only once there is something to keep -- a page that led with "0
          sesizări" would be making the case against itself. */}
      {tally.filed ? (
        <>
          <Activity tally={tally} />
          <Divider />
        </>
      ) : null}
      <StartSignUp
        busy={busy}
        run={run}
        onHasAccount={() => setSigningIn(true)}
      />
    </>
  );
}

/**
 * Step one of signing up: an address.
 *
 * Nothing is lost if the driver stops here or never types the code. They stay
 * anonymous, with the same uuid and the same reports, and may try again with a
 * different address.
 */
function StartSignUp({
  busy,
  run,
  onHasAccount,
}: {
  busy: boolean;
  run: Run;
  onHasAccount: () => void;
}) {
  const [email, setEmail] = useState("");

  return (
    <View className="gap-3 p-5">
      <FormTitle>Fă-ți cont</FormTitle>
      <Input
        accent
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <Button
        label="Trimite codul"
        loading={busy}
        disabled={!email.includes("@")}
        onPress={() =>
          run(async () => {
            const { startSignUp } = await import("@/lib/account");
            return startSignUp(email);
          })
        }
      />

      <Pressable
        onPress={onHasAccount}
        accessibilityRole="button"
        className="pt-1"
      >
        <Text className="text-center font-mid text-sm text-muted-foreground">
          Am deja cont
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Step two: the code, and a password.
 *
 * Reached from the account rather than from local state, which is what makes
 * it survive the app being closed between the two steps — and what makes it
 * the screen for the failure case as well as for the happy path. If the
 * password call failed the first time, the address is already confirmed, so
 * the code field is dropped: `finishSignUp` skips a confirmation that has
 * already happened, and asking again for a single-use code that has been spent
 * would be asking for something that can no longer work.
 */
function FinishSignUp({
  account,
  busy,
  run,
}: {
  account: Account;
  busy: boolean;
  run: Run;
}) {
  const colors = useColors();
  const [email, setEmail] = useState(account.email ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");

  /* Confirmed already: the address is on the account, so what is missing is
     only the password. */
  const confirmed = !account.anonymous;

  return (
    <View className="gap-3 p-5">
      {/* The heading is the whole explanation. Which of the two it is comes
          from the account rather than from local state, so it survives the app
          being closed between the steps. */}
      <FormTitle>
        {confirmed ? "Mai lipsește parola" : "Confirmă adresa"}
      </FormTitle>

      {confirmed ? (
        <View className="flex-row items-center gap-2.5 rounded-full bg-secondary px-4 py-3">
          <Mail size={16} color={colors.mutedForeground} />
          <Text numberOfLines={1} className="flex-1 font-title text-sm">
            {account.email ?? "—"}
          </Text>
        </View>
      ) : (
        <>
          <Input
            accent
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          <Input
            accent
            value={code}
            onChangeText={setCode}
            placeholder="Codul din email"
            autoCapitalize="none"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
          />
        </>
      )}

      <Input
        accent
        value={password}
        onChangeText={setPassword}
        placeholder="Parolă nouă"
        autoCapitalize="none"
        secureTextEntry
        autoComplete="new-password"
      />
      <Button
        label="Salvează"
        loading={busy}
        disabled={
          password.length < 8 ||
          (!confirmed && (code.trim().length < 6 || !email.includes("@")))
        }
        onPress={() =>
          run(async () => {
            const { finishSignUp } = await import("@/lib/account");
            return finishSignUp(email, code, password);
          })
        }
      />

      {confirmed ? null : (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            run(async () => {
              const { startSignUp } = await import("@/lib/account");
              return startSignUp(email);
            })
          }
          className="pt-1"
        >
          <Text className="text-center font-mid text-sm text-muted-foreground">
            Trimite din nou codul
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * Signing into an existing account from a phone that is already somebody.
 *
 * The warning is this screen's job, and `signIn` refuses without `abandoning`
 * precisely so that it has to have been given. What is abandoned is not a
 * login: it is an anonymous account nobody will ever be able to prove they
 * are again, along with the right to correct the reports it filed.
 */
function SignIn({
  busy,
  run,
  onCancel,
}: {
  busy: boolean;
  run: Run;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const confirm = () =>
    Alert.alert(
      "Intri în alt cont",
      "Sesizările trimise de pe acest telefon rămân publice, dar nu le vei mai putea corecta sau retrage: erau ale contului temporar.",
      [
        { text: "Renunț", style: "cancel" },
        {
          text: "Continuă",
          style: "destructive",
          onPress: () =>
            run(async () => {
              const { signIn } = await import("@/lib/account");
              return signIn(email, password, { abandoning: true });
            }),
        },
      ],
    );

  return (
    <View className="gap-3 p-5">
      <FormTitle>Intră în cont</FormTitle>
      <Input
        accent
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <Input
        accent
        value={password}
        onChangeText={setPassword}
        placeholder="Parolă"
        autoCapitalize="none"
        secureTextEntry
        autoComplete="current-password"
      />
      <Button
        label="Intră"
        loading={busy}
        disabled={!email.includes("@") || !password}
        onPress={confirm}
      />
      <Pressable onPress={onCancel} accessibilityRole="button" className="pt-1">
        <Text className="text-center font-mid text-sm text-muted-foreground">
          Înapoi
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * The account of somebody who has signed up.
 *
 * One card, four rows, and nothing open until it is asked for. An accordion
 * rather than several independent toggles: two settings expanded at once push
 * the third off the screen, and these are alternatives rather than a checklist.
 */
function SignedIn({
  account,
  busy,
  run,
}: {
  account: Account;
  busy: boolean;
  run: Run;
}) {
  const colors = useColors();
  const [open, setOpen] = useState<"name" | "factor" | null>(null);
  const [name, setName] = useState(account.displayName ?? "");
  const [enrolment, setEnrolment] = useState<{
    factorId: string;
    secret: string;
  } | null>(null);
  const [code, setCode] = useState("");

  const toggle = (which: "name" | "factor") =>
    setOpen((current) => (current === which ? null : which));

  /* What the second-factor row says closed, which is the whole reason it is
     worth having a row rather than a screen. Three states and they are not
     degrees of the same thing: one is done, one is a job half finished, one is
     an invitation. */
  const factorValue =
    account.assurance === "aal2"
      ? "Activată"
      : canPassSecondFactor(account)
        ? "Confirmă"
        : "Dezactivată";

  return (
    <View className="mt-7 gap-3 px-5">
      <SectionHeader title="Contul tău" />
      <Card className="overflow-hidden">
        {/* No handler: changing the address is a re-verification, not an edit,
            and there is nothing here that does it yet. Shown because it is the
            answer to the only question this page is ever opened to check --
            which account am I signed in as. */}
        <SettingRow
          icon={<Mail size={16} color={colors.foreground} />}
          title="Email"
          value={account.email ?? "—"}
        />

        <Divider />

        <SettingRow
          icon={<UserRound size={16} color={colors.foreground} />}
          title="Numele tău"
          value={account.displayName ?? "Nespus"}
          open={open === "name"}
          onPress={() => toggle("name")}
        >
          <Input
            accent
            value={name}
            onChangeText={setName}
            placeholder="Cum să îți spunem"
            autoCapitalize="words"
          />
          <Button
            size="sm"
            label="Salvează"
            loading={busy}
            disabled={name.trim() === (account.displayName ?? "")}
            onPress={() =>
              run(async () => {
                const { saveProfile } = await import("@/lib/account");
                const next = await saveProfile({
                  display_name: name.trim() || null,
                });
                setOpen(null);
                return next;
              })
            }
          />
        </SettingRow>

        <Divider />

        {/* The switch lives on the row: there are two states and no form, so
            opening anything would be a step between a question and its answer.
            Why it is asked at all is #21's and #22's business -- the obligation
            attaches at the moment of the declaration, and a host who was never
            asked cannot be told apart from one who said no. */}
        <SettingRow
          icon={<Store size={16} color={colors.foreground} />}
          title="Închiriez ca profesionist"
          right={
            <Switch
              value={account.trader}
              disabled={busy}
              onValueChange={(is_trader) =>
                run(async () => {
                  const { saveProfile } = await import("@/lib/account");
                  return saveProfile({ is_trader });
                })
              }
              trackColor={{ true: colors.primary, false: colors.border }}
              thumbColor={colors.card}
            />
          }
        />

        <Divider />

        <SettingRow
          icon={<KeyRound size={16} color={colors.foreground} />}
          title="Autentificare în doi pași"
          value={factorValue}
          {...(account.assurance === "aal2"
            ? { tint: colors.free }
            : canPassSecondFactor(account)
              ? { tint: colors.leaving }
              : {})}
          open={open === "factor"}
          /* No handler once it is on: there is nothing behind the row but the
             word already on it, and a chevron that opens onto an empty box is
             worse than no chevron. */
          {...(account.assurance === "aal2" && !enrolment
            ? {}
            : { onPress: () => toggle("factor") })}
        >
          {enrolment ? (
            <>
              {/* The secret itself, to be copied into an authenticator. A
                  value, not an instruction. */}
              <Text
                selectable
                className="rounded-lg bg-secondary px-4 py-3 text-center font-title text-base tracking-widest"
              >
                {enrolment.secret}
              </Text>
              <Input
                accent
                value={code}
                onChangeText={setCode}
                placeholder="Codul din aplicație"
                keyboardType="number-pad"
                textContentType="oneTimeCode"
              />
              <Button
                size="sm"
                label="Confirmă"
                loading={busy}
                disabled={code.trim().length < 6}
                onPress={() =>
                  run(async () => {
                    const { confirmSecondFactor } = await import(
                      "@/lib/account"
                    );
                    const next = await confirmSecondFactor(
                      enrolment.factorId,
                      code,
                    );
                    setEnrolment(null);
                    setCode("");
                    setOpen(null);
                    return next;
                  })
                }
              />
            </>
          ) : canPassSecondFactor(account) ? (
            /* A factor exists and this session has not been challenged on it.
               Offering "Adaugă" here would be wrong twice: it would read as
               the app having lost the setup, and Supabase refuses to enrol a
               second factor from a session that has not passed the first. */
            <>
              <Input
                accent
                value={code}
                onChangeText={setCode}
                placeholder="Codul din aplicație"
                keyboardType="number-pad"
                textContentType="oneTimeCode"
              />
              <Button
                size="sm"
                label="Confirmă"
                loading={busy}
                disabled={code.trim().length < 6}
                onPress={() =>
                  run(async () => {
                    const { passSecondFactor } = await import("@/lib/account");
                    const next = await passSecondFactor(code);
                    setCode("");
                    setOpen(null);
                    return next;
                  })
                }
              />
            </>
          ) : canEnrolSecondFactor(account) ? (
            <>
              {/* The row's own value already says whether it is on. What is
                  left to offer is the act, so the act is all that is here.
                  Worth knowing and deliberately not printed: the resolver and
                  admin grants are refused outright on a session that has not
                  passed a second factor. */}
              <Button
                size="sm"
                variant="secondary"
                label="Adaugă"
                loading={busy}
                onPress={() =>
                  run(async () => {
                    const { enrolSecondFactor } = await import("@/lib/account");
                    const started = await enrolSecondFactor();
                    setEnrolment({
                      factorId: started.factorId,
                      secret: started.secret,
                    });
                  })
                }
              />
            </>
          ) : null}
        </SettingRow>
      </Card>

      {/* A plain press rather than a button, and set apart from the card: it
          is the one thing on this page that undoes the rest, and giving it the
          same weight as "save your name" is how it gets pressed by accident. */}
      <Pressable
        className="mt-2 flex-row items-center justify-center gap-2 py-3 active:opacity-60"
        accessibilityRole="button"
        onPress={() =>
          run(async () => {
            const { signOut } = await import("@/lib/account");
            await signOut();
            const { currentAccount } = await import("@/lib/identity");
            return currentAccount();
          })
        }
      >
        <LogOut size={16} color={colors.destructive} />
        <Text className="font-title text-sm text-destructive">
          Ieși din cont
        </Text>
      </Pressable>
    </View>
  );
}


/**
 * A grant this session holds and cannot use.
 *
 * Its own component so that the code field is not shared with the enrolment
 * one below: they are different acts and typing into one must not look like
 * progress on the other.
 */
function SecondFactorPrompt({
  roles,
  busy,
  onSubmit,
}: {
  roles: AccountRole[];
  busy: boolean;
  onSubmit: (code: string) => void;
}) {
  const colors = useColors();
  const [code, setCode] = useState("");
  /* The role names go in the heading rather than into a sentence under it.
     "Autoritate suspendată" is the entire message, and it is the one thing on
     the page somebody needs at a glance. */
  const which = roles.map((role) => roleLabel[role]).join(" și ");

  return (
    <Card className="gap-3 p-4">
      <View className="flex-row items-center gap-2">
        <ShieldCheck size={20} color={colors.foreground} />
        <Text className="flex-1 font-title text-base">
          {which} suspendat până confirmi
        </Text>
      </View>
      <Input
        accent
        value={code}
        onChangeText={setCode}
        placeholder="Codul din aplicație"
        keyboardType="number-pad"
        textContentType="oneTimeCode"
      />
      <Button
        label="Confirmă"
        loading={busy}
        disabled={code.trim().length < 6}
        onPress={() => onSubmit(code)}
      />
    </Card>
  );
}
