/**
 * Tests for lib/private-spots.ts and the fork it puts through the belief model.
 *
 * The rule under test is one sentence: a stranger may not say whether somebody
 * else's parking space is free. Everything here is a way of trying to break it.
 *
 * Worth saying why that rule is not merely a preference. Letting an owner offer
 * their own space is lawful in Romania; doing the same with a public kerb is
 * not, and reaches a contravention fine and art. 339 Cod Penal. So the split
 * between `public` and `private` is a legal boundary that happens to be
 * expressed in the type system, and a test that let the two blur would be
 * removing a guard rail rather than relaxing a rule.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  NOT_OFFERED,
  byStart,
  declaredStatus,
  isPrivate,
  liveWindows,
  mayDeclare,
  offeredAt,
} from "../lib/private-spots.ts";
import type { AvailabilityWindow, ParkingSpot } from "../types/index.ts";

const at = (iso: string) => new Date(iso);

/** Bucharest is UTC+3 in August, so 09:00 UTC is noon on the wall. */
const NOON_WED = at("2026-08-05T09:00:00Z");

const window = (over: Partial<AvailabilityWindow> = {}): AvailabilityWindow => ({
  id: "w1",
  spotId: "p1",
  from: 9 * 60,
  to: 17 * 60,
  ...over,
});

const privateSpot = (over: Partial<ParkingSpot> = {}): ParkingSpot => ({
  id: "p1",
  title: "Garaj, Str. Glinka 12",
  access: "private_property",
  source: "owner",
  latitude: 44.465,
  longitude: 26.09,
  ownerId: "owner_1",
  ownerName: "Ana",
  ...over,
});

const publicSpot = (over: Partial<ParkingSpot> = {}): ParkingSpot => ({
  id: "s1",
  title: "Strada Lipscani",
  access: "public_facility",
  source: "community",
  latitude: 44.4319,
  longitude: 26.1015,
  ...over,
});

describe("offeredAt", () => {
  test("a spot with no windows is not on offer", () => {
    /* Silence from an owner is a no. The tempting alternative -- treat "nobody
       has said anything" as "help yourself" -- is the same mistake as reading an
       unsurveyed kerb as free, with a stranger's garage attached to it. */
    const offer = offeredAt([], NOON_WED);
    assert.equal(offer.open, false);
    assert.equal(offer.window, null);
    assert.deepEqual(NOT_OFFERED, { open: false, window: null });
  });

  test("inside the window it is offered, and says until when", () => {
    const offer = offeredAt([window()], NOON_WED);
    assert.equal(offer.open, true);
    assert.equal(offer.until, "2026-08-05T14:00:00.000Z"); // 17:00 local
  });

  test("outside the window it is not, and says when it opens again", () => {
    const offer = offeredAt([window()], at("2026-08-05T16:00:00Z")); // 19:00
    assert.equal(offer.open, false);
    assert.equal(offer.until, "2026-08-06T06:00:00.000Z"); // 09:00 tomorrow
  });

  test("the price rides on the window, not on the spot", () => {
    /* An owner may lend the space free while they are at work and charge for it
       overnight. A price on the spot could not express that. */
    const free = window({ id: "wf", from: 9 * 60, to: 17 * 60 });
    const paid = window({ id: "wp", from: 19 * 60, to: 23 * 60, pricePerHour: 8 });

    assert.equal(offeredAt([free, paid], NOON_WED).pricePerHour, undefined);
    assert.equal(offeredAt([free, paid], at("2026-08-05T18:00:00Z")).pricePerHour, 8);
  });

  test("no price is quoted while nothing is on offer", () => {
    const paid = window({ pricePerHour: 8 });
    assert.equal(offeredAt([paid], at("2026-08-05T02:00:00Z")).pricePerHour, undefined);
  });

  test("weekdays only means the weekend is shut", () => {
    const workdays = window({ days: [1, 2, 3, 4, 5] });
    assert.equal(offeredAt([workdays], NOON_WED).open, true);
    assert.equal(offeredAt([workdays], at("2026-08-08T09:00:00Z")).open, false);
  });

  test("an overnight offer is one window, not two", () => {
    const overnight = window({ from: 19 * 60, to: 7 * 60 });
    assert.equal(offeredAt([overnight], at("2026-08-05T18:00:00Z")).open, true); // 21:00
    assert.equal(offeredAt([overnight], at("2026-08-06T02:00:00Z")).open, true); // 05:00
    assert.equal(offeredAt([overnight], at("2026-08-06T09:00:00Z")).open, false); // 12:00
  });

  test("a one-off offer does not quietly recur every week", () => {
    /* The failure this guards against is the worst kind: silent, and in the
       owner's disfavour. Lend the garage for one Wednesday, and without the date
       bounds the app goes on offering it every Wednesday for ever. */
    const oneDay = window({ startsOn: "2026-08-05", endsOn: "2026-08-05" });
    assert.equal(offeredAt([oneDay], NOON_WED).open, true);
    assert.equal(offeredAt([oneDay], at("2026-08-12T09:00:00Z")).open, false);
  });

  test("an offer that has not started yet is not on offer", () => {
    const later = window({ startsOn: "2026-08-10" });
    assert.equal(offeredAt([later], NOON_WED).open, false);
  });

  test("once the last day has passed, nothing more is promised", () => {
    const finished = window({ endsOn: "2026-08-01" });
    const offer = offeredAt([finished], NOON_WED);
    assert.equal(offer.open, false);
    assert.equal(offer.until, undefined, "there is no next time to name");
  });
});

describe("who may speak", () => {
  test("only the owner may declare, and only on their own spot", () => {
    const spot = privateSpot();
    assert.equal(mayDeclare(spot, "owner_1"), true);
    assert.equal(mayDeclare(spot, "somebody_else"), false);
  });

  test("nobody may declare on a public kerb, however keen", () => {
    /* Not a product decision that a later feature may reverse for convenience:
       offering a space on the public road is the unlawful case. */
    assert.equal(mayDeclare(publicSpot(), "anyone"), false);
    assert.equal(mayDeclare(publicSpot({ ownerId: "anyone" }), "anyone"), false);
  });

  test("a private spot with no owner recorded belongs to nobody", () => {
    assert.equal(mayDeclare(privateSpot({ ownerId: undefined }), "owner_1"), false);
  });

  test("isPrivate is decided by access, not by having an owner", () => {
    assert.equal(isPrivate(privateSpot()), true);
    assert.equal(isPrivate(publicSpot()), false);
  });

  test("a residential permit is not a private space", () => {
    /* The distinction the three-value model exists for. A permit holder may
       park there and may not be declared for, because the ground is not
       theirs -- under the old two-value model this spot had to be labelled one
       or the other, and either label was a lie. */
    const permit = publicSpot({ access: "residential_permit" });
    assert.equal(isPrivate(permit), false);
    assert.equal(mayDeclare({ ...permit, ownerId: "owner_1" }, "owner_1"), false);
  });
});

describe("declaredStatus", () => {
  test("only free or taken, never leaving", () => {
    assert.equal(declaredStatus({ open: true, window: null }), "free");
    assert.equal(declaredStatus({ open: false, window: null }), "taken");
  });
});

describe("the owner's own list", () => {
  test("windows that have run out are dropped", () => {
    const past = window({ id: "old", endsOn: "2026-07-31" });
    const future = window({ id: "new", endsOn: "2026-12-31" });
    const open = window({ id: "forever" });

    const live = liveWindows([past, future, open], "2026-08-05");
    assert.deepEqual(live.map((w) => w.id), ["new", "forever"]);
  });

  test("they read earliest first", () => {
    const evening = window({ id: "pm", from: 18 * 60, to: 22 * 60 });
    const morning = window({ id: "am", from: 7 * 60, to: 9 * 60 });
    assert.deepEqual([evening, morning].sort(byStart).map((w) => w.id), ["am", "pm"]);
  });
});

describe("only an owner may say whether a private spot is free", () => {
  test("a public spot carries no status at all", async () => {
    /* The load-bearing assertion of the whole change. Nobody is asked about a
       public car park and nothing is invented for it, so the field a screen
       would colour a pin from is simply absent -- which is what draws it grey
       and hollow rather than as a hundred confidently full car parks. */
    const { applyDeclaration } = await import("../lib/private-spots.ts");
    const spot = applyDeclaration(publicSpot(), [], NOON_WED);

    assert.equal(spot.status, undefined);
    assert.equal(spot.offer, undefined);
    assert.equal(spot.availableCount, undefined);
  });

  test("a private spot with no window offered is shut, not free", async () => {
    /* Silence from an owner is a no. The tempting alternative -- treating "the
       owner has not said anything" as "help yourself" -- attaches a stranger's
       car to somebody's driveway. */
    const { applyDeclaration } = await import("../lib/private-spots.ts");
    const shut = applyDeclaration(privateSpot(), [], NOON_WED);

    assert.equal(shut.status, "taken");
    assert.equal(shut.availableCount, 0);
    assert.equal(shut.offer?.open, false);
  });

  test("the declaration reaches the fields screens actually read", async () => {
    /* Half the app reads `spot.status` rather than the offer -- the map's pin
       colour, the card's badge. A spot whose two copies disagreed would be free
       on the map and taken on the card. */
    const { applyDeclaration } = await import("../lib/private-spots.ts");
    const open = applyDeclaration(privateSpot(), [window({ pricePerHour: 6 })], NOON_WED);

    assert.equal(open.status, "free");
    assert.equal(open.availableCount, 1);
    assert.equal(open.pricePerHour, 6, "the price rides on the window");
    assert.equal(open.offer?.until, "2026-08-05T14:00:00.000Z");
  });
});
