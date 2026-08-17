/**
 * Tests for lib/privacy-notice.ts.
 *
 * A privacy notice fails silently. Nothing crashes when a purpose has no
 * lawful basis, nothing renders differently when a whole category of data goes
 * unmentioned, and the person it was written for is the last one who could
 * notice — they would have to already know what the app holds, which is the
 * thing the notice exists to tell them.
 *
 * So these are the checks a reader cannot make for themselves:
 *
 *   Every category of personal data the app knows it holds is explained by
 *   some purpose here. `DATA_CATEGORIES` in lib/privacy.ts is the client's
 *   copy of `data_inventory`, and the next migration to add a table has to say
 *   what it is for out loud, to the person, and not only in the register.
 *
 *   Every purpose carries a basis, and every purpose resting on legitimate
 *   interests names the interest. That basis is the one a project reaches for
 *   when it has not decided; Art. 13(1)(d) asks for the interest by name, and
 *   writing it down is what makes it arguable.
 *
 *   Nothing claims a controller this build does not have.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { DATA_CATEGORIES } from "../lib/privacy.ts";
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
  coveredCategories,
  noticeGaps,
} from "../lib/privacy-notice.ts";

describe("everything the app holds is explained", () => {
  test("no category of personal data goes unmentioned", () => {
    const covered = coveredCategories();
    const missing = DATA_CATEGORIES.map((category) => category.key).filter(
      (key) => !covered.has(key),
    );

    assert.deepEqual(
      missing,
      [],
      `These are held and unexplained: ${missing.join(", ")}`,
    );
  });

  test("nothing is explained that the app does not hold", () => {
    // The other direction, and the one that produces a notice describing an
    // app that no longer exists: a table removed from the register but left in
    // here reads as a live purpose.
    const known = new Set(DATA_CATEGORIES.map((category) => category.key));
    const invented = [...coveredCategories()].filter((key) => !known.has(key));

    assert.deepEqual(invented, []);
  });
});

describe("every purpose answers for itself", () => {
  test("each one says what, why and on what basis", () => {
    for (const purpose of PURPOSES) {
      assert.ok(purpose.what.trim(), `${purpose.key} does not say what`);
      assert.ok(purpose.why.trim(), `${purpose.key} does not say why`);
      assert.ok(basisLabel(purpose.basis).trim(), `${purpose.key} has no basis`);
      assert.ok(purpose.categories.length, `${purpose.key} covers nothing`);
    }
  });

  test("legitimate interests is never used without naming the interest", () => {
    for (const purpose of PURPOSES) {
      if (purpose.basis !== "legitimate_interests") continue;
      assert.ok(
        purpose.interest?.trim(),
        `${purpose.key} rests on legitimate interests and does not say whose`,
      );
    }
  });

  test("an interest is not claimed where the basis does not need one", () => {
    for (const purpose of PURPOSES) {
      if (purpose.basis === "legitimate_interests") continue;
      assert.equal(purpose.interest, undefined, `${purpose.key} balances nothing`);
    }
  });

  test("every basis reads as a sentence, not as an article number", () => {
    // The label is what a person meets. "Art. 6(1)(f)" on its own has told
    // somebody nothing and looks like it has told them something.
    for (const purpose of PURPOSES) {
      const label = basisLabel(purpose.basis);
      assert.ok(label.length > 20, `${purpose.key}: ${label}`);
      assert.ok(/art\. 6/.test(label), `${purpose.key} does not cite the article`);
    }
  });
});

describe("the things Article 13 asks for by name", () => {
  test("recipients, and the absence of any others", () => {
    assert.ok(RECIPIENTS.length >= 3);
    for (const recipient of RECIPIENTS) {
      assert.ok(recipient.who.trim());
      assert.ok(recipient.what.trim());
    }
    assert.ok(NOBODY_ELSE.trim());
  });

  test("third countries, automated decisions and what happens if you refuse", () => {
    // All three are absences. An absence a reader has to infer is one they
    // cannot rely on, which is why each is a stated sentence.
    assert.ok(TRANSFERS.trim());
    assert.ok(AUTOMATED_DECISIONS.trim());
    assert.ok(IF_YOU_DO_NOT_GIVE_IT.trim());
  });

  test("the supervisory authority is named and reachable", () => {
    assert.ok(SUPERVISORY_AUTHORITY.name.includes("ANSPDCP"));
    assert.ok(SUPERVISORY_AUTHORITY.address.trim());
    assert.ok(SUPERVISORY_AUTHORITY.site.trim());
  });

  test("every right says what it is and where it is", () => {
    for (const right of RIGHTS) {
      assert.ok(right.title.trim(), `${right.key} has no title`);
      assert.ok(right.what.trim(), `${right.key} does not say what it means`);
      assert.ok(right.how.trim(), `${right.key} does not say where to go`);
    }
  });

  test("access, portability, rectification, erasure and a complaint are all offered", () => {
    const offered = new Set(RIGHTS.map((right) => right.key));

    for (const required of [
      "access",
      "portability",
      "rectification",
      "erasure",
      "restriction",
      "complaint",
    ]) {
      assert.ok(offered.has(required), `no route to ${required}`);
    }
  });
});

describe("the controller this build does not have", () => {
  test("an empty name or contact is not a controller", () => {
    assert.equal(controllerIsNamed(), CONTROLLER.name !== "" && CONTROLLER.contact !== "");
  });

  test("the gap is announced rather than left for the reader to notice", () => {
    if (controllerIsNamed()) {
      assert.deepEqual(noticeGaps(), []);
      return;
    }
    assert.ok(
      noticeGaps().length,
      "there is nobody to write to and the notice does not say so",
    );
  });
});
