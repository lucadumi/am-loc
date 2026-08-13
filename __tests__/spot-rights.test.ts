/**
 * Tests for lib/spot-rights.ts.
 *
 * The rule under test is one sentence: money may be asked for a parking space
 * only if somebody owns it. Everything here is a way of trying to break it.
 *
 * Worth stating why that is not a product preference. Letting an owner offer
 * their own space is lawful in Romania; doing the same with a public kerb or
 * with a space the city allocated by permit is not, and reaches a contravention
 * fine and art. 339 Cod Penal. So this file guards a legal boundary that
 * happens to be expressed in the type system, and a test relaxed here would be
 * removing a guard rail rather than loosening a rule.
 *
 * The residential permit is the case the old two-value model could not hold,
 * and it is deliberately over-represented below: it looks like a private space
 * from the driver's seat and like a public one from the land registry, and the
 * two capabilities that matter take one value from each.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  SPOT_ACCESS,
  hasExactCount,
  isOwnedProperty,
  mayBeSharedForMoney,
  needsRightVerified,
  rightsOf,
  toSpotAccess,
  type SpotAccess,
} from "../lib/spot-rights.ts";

const at = (access: SpotAccess) => ({ access });

describe("the shape of the model", () => {
  test("three kinds, and every one of them has an answer to everything", () => {
    /* A total function over the union is the point: adding a fourth kind of
       place should fail to compile until somebody has answered each question
       out loud, rather than inheriting an answer that happens to be false. */
    assert.equal(SPOT_ACCESS.length, 3);
    for (const access of SPOT_ACCESS) {
      const rights = rightsOf(at(access));
      for (const key of [
        "discoverable",
        "reservable",
        "paidSharingAllowed",
        "verificationRequired",
        "exactCount",
      ] as const) {
        assert.equal(typeof rights[key], "boolean", `${access}.${key}`);
      }
    }
  });

  test("everything is discoverable", () => {
    // Hiding a place from the map protects nobody: the question this model
    // answers is what may be *done* with a space, not whether it exists.
    for (const access of SPOT_ACCESS) {
      assert.ok(rightsOf(at(access)).discoverable, access);
    }
  });
});

describe("money", () => {
  test("only property may be charged for", () => {
    assert.ok(mayBeSharedForMoney(at("private_property")));
    assert.ok(!mayBeSharedForMoney(at("public_facility")));
    assert.ok(!mayBeSharedForMoney(at("residential_permit")));
  });

  test("a permit space is not chargeable, whoever holds it", () => {
    /* The failure the whole issue exists to prevent. A permit is a right to
       park granted to a person, not ownership of the asphalt, so selling it is
       selling a piece of public road -- and the holder being recorded on the
       spot must not change that. */
    assert.ok(!mayBeSharedForMoney(at("residential_permit")));
    assert.ok(!rightsOf(at("residential_permit")).reservable);
  });

  test("exactly one kind of place may be reserved", () => {
    const reservable = SPOT_ACCESS.filter((a) => rightsOf(at(a)).reservable);
    assert.deepEqual(reservable, ["private_property"]);
  });
});

describe("verification", () => {
  test("anything a person lists has to have its lister proved", () => {
    /* Both kinds somebody can put on the map need it. A public facility is the
       only kind nobody lists -- it arrives from a registry -- so it is the only
       kind with nothing to verify. */
    assert.ok(needsRightVerified(at("private_property")));
    assert.ok(needsRightVerified(at("residential_permit")));
    assert.ok(!needsRightVerified(at("public_facility")));
  });

  test("verification is not the same question as payment", () => {
    // A permit space takes one value from each: verified, and never paid.
    // Collapsing the two into one flag is exactly the mistake this model is
    // built to prevent.
    const permit = at("residential_permit");
    assert.ok(needsRightVerified(permit));
    assert.ok(!mayBeSharedForMoney(permit));
  });
});

describe("whether a count would be a fact", () => {
  test("only where somebody controls the gate", () => {
    assert.ok(hasExactCount(at("private_property")));
    assert.ok(!hasExactCount(at("public_facility")));
    assert.ok(!hasExactCount(at("residential_permit")));
  });

  test("a permit space is not countable merely for having a holder", () => {
    // The holder knows whether *their* space is taken and has no way to tell
    // the app; nothing about the allocation gives the app a ledger.
    assert.ok(!hasExactCount(at("residential_permit")));
  });
});

describe("isOwnedProperty", () => {
  test("a permit is not ownership", () => {
    /* The rename that carried the meaning change. Under the old model
       `isPrivate` meant "not public", and those were the same set; they are
       not any more, and every caller means property. */
    assert.ok(isOwnedProperty(at("private_property")));
    assert.ok(!isOwnedProperty(at("residential_permit")));
    assert.ok(!isOwnedProperty(at("public_facility")));
  });
});

describe("reading what was stored before the model changed", () => {
  test("the two old values have exact readings", () => {
    // `private` was the only thing an owner could declare windows on, so it
    // meant property; `public` meant everything else.
    assert.equal(toSpotAccess("private"), "private_property");
    assert.equal(toSpotAccess("public"), "public_facility");
  });

  test("the new values pass through", () => {
    for (const access of SPOT_ACCESS) {
      assert.equal(toSpotAccess(access), access);
    }
  });

  test("absence and nonsense read as public road", () => {
    /* The safe direction, and the reason it is safe is asymmetric: a permit
       space mistaken for public loses its holder a listing they cannot make
       yet, where a public space mistaken for property would invite one nobody
       may make. */
    assert.equal(toSpotAccess(null), "public_facility");
    assert.equal(toSpotAccess(undefined), "public_facility");
    assert.equal(toSpotAccess(""), "public_facility");
    assert.equal(toSpotAccess("whatever"), "public_facility");
  });

  test("nothing unreadable turns into something chargeable", () => {
    // The property that matters more than any individual mapping above.
    for (const stored of [null, undefined, "", "whatever", "public", "PRIVATE"]) {
      assert.ok(
        !mayBeSharedForMoney(at(toSpotAccess(stored))),
        `${String(stored)} became chargeable`,
      );
    }
  });
});
