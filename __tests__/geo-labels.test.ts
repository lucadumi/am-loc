/**
 * Tests for what the app says a car park costs.
 *
 * Small function, outsized consequences. It is the one place that decides
 * whether a driver reads "Gratuit" over a lot that charges, and Bucharest is
 * the city where that matters: the blue zone charges 5 lei an hour, a
 * residents' bay needs a permit, and some yards are genuinely free, and the
 * three are told apart by a sign rather than by any dataset. 70 of the 838
 * imported car parks have no published tariff, so the unknown branches are the
 * common case rather than an edge.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { formatDistance, formatPrice } from "../lib/geo.ts";

describe("saying what a car park costs", () => {
  test("a known price is quoted, whatever `paid` says", () => {
    assert.equal(formatPrice(5, true), "5 lei / oră");
    assert.equal(formatPrice(40, undefined), "40 lei / oră");
  });

  /* Free is a claim, and the app may only make it when somebody recorded
     `fee=no`. Everything else is some flavour of "not known". */
  test("only a recorded `fee=no` is called free", () => {
    assert.equal(formatPrice(undefined, false), "Gratuit");
    assert.notEqual(formatPrice(undefined, undefined), "Gratuit");
    assert.notEqual(formatPrice(undefined, true), "Gratuit");
  });

  test("charging without a published tariff says so, and no more", () => {
    /* Not "Cu plată · tarif necunoscut": a driver reading "cu plată" already
       knows the amount was not given, so the qualifier made the app's longest
       label out of its least information. */
    assert.equal(formatPrice(undefined, true), "Cu plată");
  });

  test("an unknown keeps its qualifier, because there the absence is the point", () => {
    // Shortened to "Cu plată" or dropped, this would read as free.
    assert.equal(formatPrice(undefined, undefined), "Tarif necunoscut");
  });

  test("zero is a price, not an absence", () => {
    // `pricePerHour: 0` means somebody wrote down that it costs nothing, which
    // is a stronger statement than `paid: false` and must not fall through to
    // the unknown branch.
    assert.equal(formatPrice(0, undefined), "0 lei / oră");
  });
});

describe("saying how far away it is", () => {
  test("metres below a kilometre, rounded to the nearest ten", () => {
    assert.equal(formatDistance(84), "80 m");
    assert.equal(formatDistance(350), "350 m");
    assert.equal(formatDistance(999), "1000 m");
  });

  test("kilometres to one decimal above that", () => {
    assert.equal(formatDistance(1000), "1.0 km");
    /* 1.45 rounds down, not up: `toFixed` rounds a binary float whose nearest
       representation is a hair under 1.45. Pinned as it behaves rather than as
       arithmetic would suggest, so a future change to the formatting is a
       decision somebody made rather than a surprise. */
    assert.equal(formatDistance(1450), "1.4 km");
    assert.equal(formatDistance(1460), "1.5 km");
  });
});
