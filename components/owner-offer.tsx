/**
 * What an owner has offered on their own spot, and — if it is yours — the
 * controls to change it.
 *
 * One component for both cases on purpose. A driver and an owner are looking at
 * the same fact, and the difference between them is who may edit it, not what
 * they are shown. Splitting it into a read-only card and an editor invites the
 * two to drift, and the day they disagree is the day an owner is told their
 * garage is on offer at a time nobody else can see it.
 *
 * Nothing here decides whether the controls appear; `mayDeclare` in
 * lib/private-spots.ts does, and it is passed in as `mine`. That keeps the
 * authority rule in one place rather than reconstructed slightly differently in
 * every screen that touches it — and the real enforcement is in Postgres, so a
 * hidden button is a courtesy rather than a lock.
 */

import { Clock, Plus, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { palette } from "@/constants/theme";
import { addWindow, removeWindow } from "@/lib/availability-windows";
import { bucharestDateKey } from "@/lib/bucharest-time";
import { formatClock } from "@/lib/geo";
import { haptics } from "@/lib/haptics";
import { byStart, liveWindows, type SpotOffer } from "@/lib/private-spots";
import type { AvailabilityWindow, ParkingSpot } from "@/types";

/** Romanian weekday initials, Sunday first, to match `days` in a window. */
const DAY_LABELS = ["D", "L", "Ma", "Mi", "J", "V", "S"];

const WORKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];

/** Minutes from midnight as "09:00". */
function clockOf(minute: number): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
}

/** How an owner reads a window back: when, on which days, for how much. */
function describeWindow(window: AvailabilityWindow): string {
  const when = `${clockOf(window.from)}–${clockOf(window.to)}`;
  const days = !window.days
    ? "zilnic"
    : sameSet(window.days, WORKDAYS)
      ? "luni–vineri"
      : sameSet(window.days, WEEKEND)
        ? "în weekend"
        : window.days
            .slice()
            .sort()
            .map((d) => DAY_LABELS[d])
            .join(", ");
  return `${days} · ${when}`;
}

const sameSet = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** The presets an owner actually wants, rather than a full schedule editor. */
const PRESETS: { label: string; window: Omit<AvailabilityWindow, "id" | "spotId"> }[] = [
  {
    label: "Luni–vineri, 9–17",
    window: { from: 9 * 60, to: 17 * 60, days: WORKDAYS },
  },
  {
    label: "Peste noapte, 19–7",
    window: { from: 19 * 60, to: 7 * 60 },
  },
  {
    label: "Weekend, 8–20",
    window: { from: 8 * 60, to: 20 * 60, days: WEEKEND },
  },
];

export function OwnerOffer({
  spot,
  windows,
  offer,
  mine,
  onChanged,
}: {
  spot: ParkingSpot;
  windows: AvailabilityWindow[];
  offer?: SpotOffer;
  /** Whether this device may change the offer. Decided by `mayDeclare`. */
  mine: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const today = bucharestDateKey(new Date());
  const listed = liveWindows(windows, today).sort(byStart);

  const offerToday = async (preset: (typeof PRESETS)[number]) => {
    if (busy) return;
    setBusy(true);
    haptics.selection();
    try {
      await addWindow({ ...preset.window, spotId: spot.id });
      onChanged();
    } catch (error) {
      console.error("Could not offer the spot", error);
      haptics.warning();
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (id: string) => {
    if (busy) return;
    setBusy(true);
    haptics.selection();
    try {
      await removeWindow(id);
      onChanged();
    } catch (error) {
      console.error("Could not withdraw the offer", error);
      haptics.warning();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="mt-4 rounded-lg border-hairline border-border bg-card p-4">
      <View className="flex-row items-center gap-2">
        <Clock size={16} color={palette.indigo[600]} />
        <Text className="flex-1 font-title text-sm text-foreground">
          {mine ? "Când îl oferi" : "Când e liber"}
        </Text>
      </View>

      {/* What is true right now, said plainly. `until` is the moment the answer
          changes, which is the one number a driver standing on the pavement
          actually needs. */}
      <Text className="mt-2 font-mid text-xs text-muted-foreground">
        {offer?.open
          ? offer.until
            ? `Liber acum, până la ${formatClock(offer.until)}`
            : "Liber acum"
          : offer?.until
            ? `Ocupat, se eliberează la ${formatClock(offer.until)}`
            : "Nu e oferit momentan"}
      </Text>

      {offer?.open && offer.window?.note ? (
        <Text className="mt-2 font-mid text-xs text-foreground">
          {offer.window.note}
        </Text>
      ) : null}

      {listed.length ? (
        <View className="mt-3 gap-2">
          {listed.map((window) => (
            <View
              key={window.id}
              className="flex-row items-center gap-2 rounded-lg bg-secondary px-3 py-2"
            >
              <Text className="flex-1 font-mid text-xs text-foreground">
                {describeWindow(window)}
                {window.pricePerHour ? ` · ${window.pricePerHour} lei/oră` : " · gratuit"}
              </Text>
              {mine ? (
                <Pressable
                  onPress={() => void withdraw(window.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Retrage intervalul ${describeWindow(window)}`}
                  hitSlop={8}
                  disabled={busy}
                >
                  <X size={16} color={palette.mutedForeground} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <Text className="mt-3 font-mid text-xs text-muted-foreground">
          {mine
            ? "Niciun interval încă. Locul tău nu apare în căutări până nu oferi unul."
            : "Proprietarul nu a anunțat niciun interval."}
        </Text>
      )}

      {mine ? (
        <View className="mt-3 flex-row flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Pressable
              key={preset.label}
              onPress={() => void offerToday(preset)}
              accessibilityRole="button"
              disabled={busy}
              className="flex-row items-center gap-1.5 rounded-full border-hairline border-border bg-background px-3 py-2"
            >
              <Plus size={14} color={palette.foreground} />
              <Text className="font-semi text-xs text-foreground">{preset.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
