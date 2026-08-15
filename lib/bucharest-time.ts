/**
 * Bucharest wall clock time, and windows expressed in it.
 *
 * Two very different parts of this app turn out to need exactly the same thing.
 * A kerb's regime is a window in local time -- the blue zone is charged 08:00 to
 * 20:00, every day, weekends included. An owner's offer of their own parking
 * space is the same shape -- free 09:00 to 17:00, Monday to Friday, while they
 * are at work. Both are read off a wall clock in Bucharest, both can run past
 * midnight, and both have to answer "and when does that change?".
 *
 * Written twice, the two would drift, and the half that drifted would be the
 * half nobody tested on the last Sunday in October. So it is written once.
 *
 * ---
 *
 * ON NOT USING `Intl`. The offset is computed from the EU rule rather than asked
 * of the platform. `Intl.DateTimeFormat` with a named zone is the obvious answer
 * and the wrong one here: under Hermes its availability depends on the
 * platform's ICU build, so this module would work in `node --test` and then
 * quietly disagree with itself on somebody's Android. The rule is fifteen lines,
 * has not changed since 1996, and can be tested.
 *
 * It also cannot be got from the device clock. `new Date().getHours()` is the
 * hour where the *phone* thinks it is, and a sign on Strada Lipscani says 8
 * regardless of what a visitor's handset is set to.
 *
 * Pure, and imports nothing at runtime, so the tests load it directly.
 */

const MINUTE = 60_000;
const DAY = 1440 * MINUTE;

/**
 * Minutes Bucharest is ahead of UTC: 120 in winter (EET), 180 in summer (EEST).
 *
 * The EU rule: clocks go forward on the last Sunday of March and back on the
 * last Sunday of October, both at 01:00 UTC, so the whole union turns over at
 * the same instant rather than country by country.
 */
export function bucharestOffset(when: Date): number {
  const year = when.getUTCFullYear();
  const t = when.getTime();
  return t >= lastSundayUTC(year, 2) && t < lastSundayUTC(year, 9) ? 180 : 120;
}

/** The last Sunday of a month at 01:00 UTC, when the EU clocks move. */
function lastSundayUTC(year: number, month: number): number {
  // Day zero of the next month is the last day of this one.
  const last = new Date(Date.UTC(year, month + 1, 0, 1));
  last.setUTCDate(last.getUTCDate() - last.getUTCDay());
  return last.getTime();
}

/** A wall clock reading in Bucharest. */
export interface BucharestTime {
  /** Minutes since local midnight, 0–1439. */
  minute: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
}

/** What the clock on a Bucharest wall says at a given instant. */
export function bucharestTime(when: Date): BucharestTime {
  const shifted = new Date(when.getTime() + bucharestOffset(when) * MINUTE);
  return {
    minute: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

/**
 * A marker for the Bucharest calendar date containing `when`, as the UTC
 * midnight of that date. Not an instant anybody experiences; a way to do date
 * arithmetic on local days without a timezone library.
 */
export function bucharestDate(when: Date): number {
  const shifted = new Date(when.getTime() + bucharestOffset(when) * MINUTE);
  return Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
}

/** The Bucharest calendar date as `YYYY-MM-DD`, for comparing against bounds. */
export function bucharestDateKey(when: Date): string {
  return new Date(bucharestDate(when)).toISOString().slice(0, 10);
}

/** The real instant at which a local date reaches a given local minute. */
export function instantOf(dateMarker: number, minute: number): number {
  const wall = dateMarker + minute * MINUTE;
  // Guess with the standard offset, then re-ask using the offset actually in
  // force at that moment. Wrong only inside the one hour a year the local clock
  // skips, which no parking schedule and no commute turns on.
  return wall - bucharestOffset(new Date(wall - 120 * MINUTE)) * MINUTE;
}

/**
 * A recurring stretch of wall clock time.
 *
 * `to` may be less than or equal to `from`, meaning the window runs past
 * midnight; an owner who leaves the car out from eight in the evening until
 * eight the next morning is describing one window, not two. When it wraps, the
 * weekday is the day the window *opened* -- a Friday night window is a Friday
 * window at two in the morning on Saturday.
 */
export interface WallClockWindow {
  /** Minutes from local midnight it opens, e.g. 480 for 08:00. */
  from: number;
  /** Minutes from local midnight it closes. */
  to: number;
  /**
   * Weekdays it applies to, 0 = Sunday … 6 = Saturday. Absent means every day.
   *
   * Absent is the right default for the blue zone and the thing most people get
   * wrong about it: Bucharest charges at the weekend too.
   */
  days?: number[];
  /**
   * First and last Bucharest calendar date (`YYYY-MM-DD`) the window applies.
   *
   * A kerb regime has neither -- a council decision has no end date, it gets
   * replaced. An owner lending their space next week has both, and without them
   * the app would cheerfully announce that the window reopens every Tuesday
   * forever. Compared as strings, which is exactly right for ISO dates and
   * avoids parsing a date to answer a question about a calendar.
   */
  startsOn?: string;
  endsOn?: string;
}

const covered = (days: number[] | undefined, weekday: number) =>
  !days || days.includes(weekday);

/**
 * Whether a window is open at an instant.
 *
 * Asked directly rather than derived from a list of edges. The edge-walking
 * version has to decide what "the last edge before now" means when two windows
 * overlap, and gets it wrong; asking each window whether it contains the moment
 * is true by inspection and stays true however they are arranged.
 */
export function covers(window: WallClockWindow, when: Date): boolean {
  const { minute, weekday } = bucharestTime(when);
  const wraps = window.to <= window.from;

  const inBounds = (dateKey: string) =>
    (!window.startsOn || dateKey >= window.startsOn) &&
    (!window.endsOn || dateKey <= window.endsOn);

  if (!wraps) {
    return (
      covered(window.days, weekday) &&
      minute >= window.from &&
      minute < window.to &&
      inBounds(bucharestDateKey(when))
    );
  }
  // Past midnight: either the late part of a day the window covers, or the
  // early part of the day after one. The date bound follows the day the window
  // opened, so a window ending on the 5th still runs into the small hours of
  // the 6th rather than being cut off at midnight.
  if (minute >= window.from) {
    return covered(window.days, weekday) && inBounds(bucharestDateKey(when));
  }
  if (minute < window.to) {
    const opened = new Date(when.getTime() - DAY);
    return (
      covered(window.days, (weekday + 6) % 7) && inBounds(bucharestDateKey(opened))
    );
  }
  return false;
}

/** What a set of windows says right now, and when that stops being true. */
export interface WindowState<W extends WallClockWindow> {
  open: boolean;
  /** ISO instant the answer changes, if it does so within the horizon. */
  until?: string;
  /** The window responsible for an open answer, for attribution. */
  window: W | null;
}

/** How far ahead to look for the moment the answer changes. */
const HORIZON_DAYS = 9;

/**
 * Whether any of these windows is open now, and when that changes.
 *
 * The state is answered by asking; only the *expiry* needs the edges, and it is
 * found by walking the sorted boundaries forward until the answer differs
 * rather than by reasoning about which window ends when. With overlapping
 * windows those are not the same question -- an owner offering 09:00-13:00 and
 * 12:00-17:00 is offering one unbroken afternoon, and a driver told it ends at
 * one o'clock would be told something false.
 */
export function windowState<W extends WallClockWindow>(
  windows: W[],
  when: Date,
): WindowState<W> {
  const isOpen = (at: Date) => windows.some((window) => covers(window, at));
  const openNow = isOpen(when);
  const responsible = windows.find((window) => covers(window, when)) ?? null;

  const now = when.getTime();
  const today = bucharestDate(when);
  const edges: number[] = [];

  for (const window of windows) {
    const wraps = window.to <= window.from;
    for (let day = -1; day <= HORIZON_DAYS; day++) {
      const marker = today + day * DAY;
      if (!covered(window.days, new Date(marker).getUTCDay())) continue;
      edges.push(instantOf(marker, window.from));
      edges.push(instantOf(wraps ? marker + DAY : marker, window.to));
    }
  }

  const next = edges
    .filter((edge) => edge > now)
    .sort((a, b) => a - b)
    .find((edge) => isOpen(new Date(edge)) !== openNow);

  return {
    open: openNow,
    ...(next === undefined ? {} : { until: new Date(next).toISOString() }),
    window: responsible,
  };
}

/**
 * How long ago something happened, in words.
 *
 * For a list of complaints, where the exact minute is never the question and
 * "acum 3 zile" is. Anything past a week gets a date instead: at that distance
 * "acum 23 de zile" is a number somebody has to convert, and a date is the
 * thing they were converting it to.
 *
 * ROMANIAN'S PLURAL RULE IS THE REASON THIS IS TESTED. The language has three
 * agreement classes, not two, and the third catches everybody: from 20 upwards
 * a number takes "de" before the noun -- "3 zile" but "20 de zile". Getting it
 * wrong does not read as a bug, it reads as an app written by somebody who
 * does not speak the language.
 */
export function sinceLabel(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);

  /* Including anything in the future, which a clock a few seconds out will
     produce. "Acum" is the honest answer for both, and a negative duration
     rendered literally would say "acum -1 minute". */
  if (minutes < 1) return "acum";
  if (minutes < 60) return `acum ${minutes} ${plural(minutes, "minut", "minute")}`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `acum ${hours} ${plural(hours, "oră", "ore")}`;

  const days = Math.floor(hours / 24);
  if (days <= 7) return `acum ${days} ${plural(days, "zi", "zile")}`;

  return then.toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "short",
    ...(then.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/**
 * The noun that goes with a number, Romanian's three ways.
 *
 * One takes the singular. Two to nineteen take the plural bare. Twenty and up
 * take "de" first, and so does anything whose last two digits are under 20 --
 * 101 is "101 zile", 120 is "120 de zile". The rule is on the remainder rather
 * than on the number itself, which is the part a hand-written version misses.
 */
function plural(count: number, one: string, many: string): string {
  if (count === 1) return one;
  const rest = count % 100;
  return rest === 0 || rest >= 20 ? `de ${many}` : many;
}
