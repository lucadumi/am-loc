/**
 * The notice, before anybody has to go looking for it.
 *
 * "Datele mele" answers "what have you got of mine" and this answers "what are
 * you doing with it, and on whose say-so" -- two different questions that were
 * once on the same screen, badly. The register of nine tables that used to sit
 * above a person's own complaints was this notice in the wrong place: schema
 * prose, printed at somebody who had come to look at their photographs. It
 * belongs on a screen of its own, reachable from the profile, and it can be as
 * long as it needs to be there.
 *
 * WHY IT IS ORDERED BY PURPOSE AND NOT BY TABLE. A register is a list of
 * things a company holds, which is the shape the database wants; a notice is
 * an answer to "why do you have that", which is the shape a person asks in.
 * `PURPOSES` in lib/privacy-notice.ts is the one, `data_inventory` in `0012`
 * is the other, and the test suite makes the second cover the first --
 * anything the app holds that no purpose here explains is a hole in the
 * notice, not a footnote.
 *
 * WHY THE MISSING CONTROLLER IS AT THE TOP IN A COLOURED BOX. Because that is
 * where the name would be, and a gap at the bottom of a long screen is a gap
 * nobody meets. See `noticeGaps()`: this build has no controller and no
 * address, and the honest place to say it is where a person would look for
 * somebody to write to.
 */

import { useRouter } from "expo-router";
import {
  Building2,
  FileText,
  Landmark,
  Lock,
  ShieldCheck,
  TriangleAlert,
  Users,
} from "lucide-react-native";
import { ScrollView, View } from "react-native";

import { ScreenHeader } from "@/components/screen-header";
import { Card } from "@/components/ui/card";
import { Screen } from "@/components/ui/screen";
import { Text } from "@/components/ui/text";
import { useColors } from "@/hooks/use-theme";
import {
  AUTOMATED_DECISIONS,
  CONTROLLER,
  IF_YOU_DO_NOT_GIVE_IT,
  NOBODY_ELSE,
  PURPOSES,
  RECIPIENTS,
  RIGHTS,
  SUPERVISORY_AUTHORITY,
  TRANSFERS,
  basisLabel,
  controllerIsNamed,
  noticeGaps,
} from "@/lib/privacy-notice";

export default function PrivacyNoticeScreen() {
  const colors = useColors();
  const router = useRouter();
  const gaps = noticeGaps();

  return (
    <Screen>
      <ScreenHeader title="Cum îți folosim datele" />
      <ScrollView
        contentContainerClassName="gap-5 px-4 pb-12"
        showsVerticalScrollIndicator={false}
      >
        <Text className="px-1 font-mid text-sm leading-5 text-muted-foreground">
          Pe scurt: ținem ce ai trimis tu, îl arătăm doar cui trebuie ca să
          folosească la ceva, și poți lua totul cu tine sau șterge tot, oricând.
          Mai jos e varianta lungă, care e cea care contează.
        </Text>

        {gaps.length ? (
          <Card className="gap-2 border-hairline p-4" style={{ borderColor: colors.destructive }}>
            <View className="flex-row items-center gap-2">
              <TriangleAlert size={17} color={colors.destructive} strokeWidth={2.2} />
              <Text
                className="font-title text-sm"
                style={{ color: colors.destructive }}
              >
                Ce lipsește din informarea asta
              </Text>
            </View>
            {gaps.map((gap) => (
              <Text key={gap} className="font-mid text-xs leading-5 text-muted-foreground">
                {gap}
              </Text>
            ))}
          </Card>
        ) : null}

        <Section icon={<Building2 size={17} color={colors.foreground} />} title="Cine răspunde">
          {controllerIsNamed() ? (
            <>
              <Line>{CONTROLLER.name}</Line>
              <Line>{CONTROLLER.contact}</Line>
            </>
          ) : (
            <Line>
              AmLoc, aplicația din telefonul tău. Nu există încă o persoană sau o
              firmă numită aici și nici o adresă la care să ne scrii — vezi
              caseta de sus.
            </Line>
          )}
        </Section>

        <Section
          icon={<FileText size={17} color={colors.foreground} />}
          title="Ce ținem și de ce"
        >
          {PURPOSES.map((purpose, index) => (
            <View key={purpose.key} className={index ? "mt-3.5 gap-1" : "gap-1"}>
              <Text className="font-title text-sm">{purpose.what}</Text>
              <Line>{purpose.why}</Line>
              {/* The basis on its own line and last: it is the sentence a
                  person skips and a supervisory authority reads first, and
                  folding it into the one above would lose both readers. */}
              <Line>Temei: {basisLabel(purpose.basis)}.</Line>
              {purpose.interest ? <Line>{purpose.interest}</Line> : null}
            </View>
          ))}
        </Section>

        <Section
          icon={<Users size={17} color={colors.foreground} />}
          title="Cine le mai vede"
        >
          {RECIPIENTS.map((recipient, index) => (
            <View key={recipient.who} className={index ? "mt-3 gap-1" : "gap-1"}>
              <Text className="font-title text-sm">{recipient.who}</Text>
              <Line>{recipient.what}</Line>
            </View>
          ))}
          <Line className="mt-3">{NOBODY_ELSE}</Line>
          <Line>{TRANSFERS}</Line>
        </Section>

        <Section
          icon={<Lock size={17} color={colors.foreground} />}
          title="Cât le ținem"
        >
          <Line>
            Numărul de înmatriculare și pozele dintr-o sesizare se șterg automat
            după 12 luni. Sesizarea rămâne și după — fără ele, e o notă despre un
            trotuar blocat la o dată anume.
          </Line>
          <Line>
            Lista cu cine ți-a deschis pozele se ține 24 de luni, mai mult decât
            pozele, ca să ai timp să reclami dacă cineva n-avea ce căuta acolo.
          </Line>
          <Line>
            Restul rămâne cât ai contul, iar unde ai parcat rămâne până ștergi tu
            fiecare intrare.
          </Line>
        </Section>

        <Section
          icon={<ShieldCheck size={17} color={colors.foreground} />}
          title="Ce poți cere"
        >
          {RIGHTS.map((right, index) => (
            <View key={right.key} className={index ? "mt-3.5 gap-1" : "gap-1"}>
              <Text className="font-title text-sm">{right.title}</Text>
              <Line>{right.what}</Line>
              <Line>{right.how}</Line>
            </View>
          ))}
        </Section>

        <Section
          icon={<Landmark size={17} color={colors.foreground} />}
          title="Unde reclami"
        >
          <Line>{SUPERVISORY_AUTHORITY.name}</Line>
          <Line>{SUPERVISORY_AUTHORITY.address}</Line>
          <Line>{SUPERVISORY_AUTHORITY.site}</Line>
        </Section>

        <Section title="Două lucruri pe care ți le spunem fără să întrebi">
          <Line>{AUTOMATED_DECISIONS}</Line>
          <Line>{IF_YOU_DO_NOT_GIVE_IT}</Line>
        </Section>

        {/* Last, because somebody who has read this far is the person most
            likely to want to act on it, and the buttons are one screen away. */}
        <Text
          onPress={() => router.push("/privacy")}
          accessibilityRole="link"
          className="px-1 font-title text-sm"
          style={{ color: colors.accent }}
        >
          Vezi ce avem despre tine, sau șterge tot
        </Text>
      </ScrollView>
    </Screen>
  );
}

/** A heading with an icon, and the card of prose under it. */
function Section({
  icon,
  title,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-2.5">
      <View className="flex-row items-center gap-2 px-1">
        {icon}
        <Text className="font-title text-sm">{title}</Text>
      </View>
      <Card className="gap-1 p-4">{children}</Card>
    </View>
  );
}

/** One sentence of the notice. Wraps, unlike everything else in this app. */
function Line({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Text
      className={`font-mid text-xs leading-5 text-muted-foreground ${className ?? ""}`}
    >
      {children}
    </Text>
  );
}
