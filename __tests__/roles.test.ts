/**
 * Tests for lib/roles.ts.
 *
 * The rule under test is one sentence: nobody acts as a role they were not
 * given, and nobody exercises a privileged one from a session that is only a
 * password deep. Everything here is a way of trying to break it.
 *
 * Worth saying why the client's copy of this rule is tested at all, given that
 * Postgres enforces its own in `has_role`. The two answer different questions —
 * the database decides what a request is *allowed* to do, this decides what the
 * app should *offer* — and the failure being guarded against is not a breach
 * but a lie: a screen that draws a resolver's buttons for somebody who will be
 * refused when they press one, or hides them from somebody entitled to press
 * them. The second is the one that generates support requests.
 *
 * The cases below are deliberately parallel to the branches of `has_role` in
 * `0008_accounts_and_roles.sql`, so that a change to one that is not made to
 * the other shows up here rather than on a device.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  ACCOUNT_GRANTS,
  PRIVILEGED_ROLES,
  anonymousAccount,
  blockedByAssurance,
  canEnrolSecondFactor,
  canPassSecondFactor,
  effectiveRoles,
  holds,
  isPrivileged,
  mayAdminister,
  mayBeGranted,
  mayClearReport,
  mayResolveReport,
  mayHost,
  mayResolveReports,
  needsSecondFactor,
  primaryRole,
  roleLabel,
  type Account,
  type AccountRole,
} from "../lib/roles.ts";
import {
  SECTOR_JURISDICTIONS,
  type Jurisdiction,
} from "../lib/jurisdiction.ts";
import type { Organisation } from "../types/index.ts";

/** A signed-up driver with nothing granted, at the weaker assurance level. */
const account = (over: Partial<Account> = {}): Account => ({
  id: "8f1c0e4a-0000-4000-8000-000000000001",
  anonymous: false,
  grants: [],
  assurance: "aal1",
  hasSecondFactor: false,
  passwordPending: false,
  trader: false,
  ...over,
});

describe("what a role is", () => {
  test("`user` is not a grant", () => {
    // Everybody signed in is one, so a row saying so would carry nothing --
    // and its absence would be ambiguous. The database refuses to store it
    // with a check constraint; here it is simply absent from the list.
    assert.ok(!(ACCOUNT_GRANTS as readonly string[]).includes("user"));
  });

  test("privileged means acting on somebody else's data", () => {
    assert.deepEqual([...PRIVILEGED_ROLES], ["resolver", "admin"]);
    assert.ok(isPrivileged("resolver"));
    assert.ok(isPrivileged("admin"));
    // A host acts on their own property and can hurt only themselves.
    assert.ok(!isPrivileged("host"));
    assert.ok(!isPrivileged("user"));
  });

  test("every role has a label", () => {
    for (const role of ["user", ...ACCOUNT_GRANTS] as AccountRole[]) {
      assert.ok(roleLabel[role]);
    }
  });
});

describe("holds", () => {
  test("anybody signed in is a user, anonymous included", () => {
    // The baseline reports and windows already check for. If it ever started
    // demanding an account it would lock every existing driver out of data
    // they filed themselves.
    assert.ok(holds(anonymousAccount("me"), "user"));
    assert.ok(holds(account(), "user"));
  });

  test("a grant you were not given is not yours", () => {
    assert.ok(!mayHost(account()));
    assert.ok(!mayResolveReports(account()));
    assert.ok(!mayAdminister(account()));
  });

  test("a host needs only the grant", () => {
    assert.ok(mayHost(account({ grants: ["host"] })));
  });

  test("an anonymous session holds nothing above the baseline", () => {
    // Cannot happen through the database -- a trigger refuses the row -- but
    // the client must not offer it either, or a driver taps a button that
    // will be refused and reads it as a bug in the app.
    const ghost: Account = { ...anonymousAccount("me"), grants: ["host", "admin"] };
    assert.ok(!mayHost(ghost));
    assert.ok(!mayAdminister(ghost));
    assert.deepEqual(effectiveRoles(ghost), ["user"]);
  });

  test("a privileged grant needs a second factor on this session", () => {
    const resolver = account({ grants: ["resolver"] });
    assert.ok(!mayResolveReports(resolver));
    assert.ok(mayResolveReports({ ...resolver, assurance: "aal2" }));
  });

  test("the second factor is asked of the session, not of the account", () => {
    /* Somebody who enrolled an authenticator yesterday and signed in with only
       a password today is at aal1, and the whole value of the requirement is
       that a stolen password is not enough at the moment of the request. The
       account carries no "has enrolled" field for exactly this reason: there
       is nothing to consult that would let the weaker session through. */
    assert.ok(!mayAdminister(account({ grants: ["admin"], assurance: "aal1" })));
    assert.ok(mayAdminister(account({ grants: ["admin"], assurance: "aal2" })));
  });

  test("a second factor does not conjure a grant", () => {
    assert.ok(!mayResolveReports(account({ assurance: "aal2" })));
  });

  test("an admin is not silently a resolver", () => {
    // Running the project is not the same as being a sector hall, and the
    // grant that lets somebody read a stranger's plate should be the grant
    // that says so.
    const admin = account({ grants: ["admin"], assurance: "aal2" });
    assert.ok(mayAdminister(admin));
    assert.ok(!mayResolveReports(admin));
  });
});

describe("effectiveRoles", () => {
  test("only what this session may actually act as", () => {
    const both = account({ grants: ["host", "resolver"], assurance: "aal2" });
    assert.deepEqual(effectiveRoles(both), ["user", "host", "resolver"]);
  });

  test("drops a privileged grant the session cannot use", () => {
    const resolver = account({ grants: ["host", "resolver"] });
    assert.deepEqual(effectiveRoles(resolver), ["user", "host"]);
  });
});

describe("blockedByAssurance", () => {
  test("names the grants a second factor would unlock", () => {
    const resolver = account({ grants: ["host", "resolver"] });
    assert.deepEqual(blockedByAssurance(resolver), ["resolver"]);
    assert.ok(needsSecondFactor(resolver));
  });

  test("nothing to unlock once the challenge is passed", () => {
    const resolver = account({ grants: ["resolver"], assurance: "aal2" });
    assert.deepEqual(blockedByAssurance(resolver), []);
    assert.ok(!needsSecondFactor(resolver));
  });

  test("an ordinary driver is never nagged", () => {
    // The prompt is shown to somebody whose role is suspended. Showing it to a
    // driver with nothing granted would be asking them to solve a problem they
    // do not have.
    assert.ok(!needsSecondFactor(account()));
    assert.ok(!needsSecondFactor(account({ grants: ["host"] })));
    assert.ok(!needsSecondFactor(anonymousAccount("me")));
  });
});

describe("which second-factor control to draw", () => {
  test("a factor already enrolled means a challenge, not an enrolment", () => {
    /* The bug this closes: the screen used to branch on assurance alone, so
       somebody who enrolled last week and signed in with a password today was
       told two-step was "recommended" and handed an "add" button -- which
       Supabase refuses, because it will not enrol a factor from a session that
       has not passed the one already there. */
    const enrolled = account({ hasSecondFactor: true, assurance: "aal1" });
    assert.ok(canPassSecondFactor(enrolled));
    assert.ok(!canEnrolSecondFactor(enrolled));
  });

  test("no factor means an enrolment", () => {
    assert.ok(canEnrolSecondFactor(account()));
    assert.ok(!canPassSecondFactor(account()));
  });

  test("a session already at aal2 needs neither", () => {
    const done = account({ hasSecondFactor: true, assurance: "aal2" });
    assert.ok(!canPassSecondFactor(done));
    assert.ok(!canEnrolSecondFactor(done));
  });

  test("an ordinary driver is offered it too, not only a resolver", () => {
    /* `blockedByAssurance` is about a suspended grant and is empty for a
       driver, so it cannot be what decides this: keying the control off it was
       what left everybody without a privileged role stuck at aal1 forever. */
    const driver = account({ hasSecondFactor: true, assurance: "aal1" });
    assert.deepEqual(blockedByAssurance(driver), []);
    assert.ok(canPassSecondFactor(driver));
  });

  test("an anonymous account is offered neither", () => {
    // There is no account yet to protect, and Supabase will not enrol a factor
    // on one that cannot be recovered.
    assert.ok(!canEnrolSecondFactor(anonymousAccount("me")));
    assert.ok(!canPassSecondFactor(anonymousAccount("me")));
  });
});

describe("primaryRole", () => {
  test("the highest one this session may use", () => {
    assert.equal(
      primaryRole(account({ grants: ["host", "admin"], assurance: "aal2" })),
      "admin",
    );
    assert.equal(primaryRole(account({ grants: ["host"] })), "host");
  });

  test("falls back to the one that is always true", () => {
    assert.equal(primaryRole(account()), "user");
    // A suspended grant must not be the word on the profile screen: it would
    // read as authority the person does not currently have.
    assert.equal(primaryRole(account({ grants: ["resolver"] })), "user");
  });
});

describe("mayBeGranted", () => {
  test("an anonymous account is not somewhere to put a role", () => {
    /* A grant to an anonymous account can never be exercised and can never be
       revoked by its holder, because nobody can prove they are that user. The
       app sends them to sign up instead of granting something dead. */
    assert.ok(!mayBeGranted(anonymousAccount("me")));
    assert.ok(mayBeGranted(account()));
  });
});

describe("anonymousAccount", () => {
  test("keeps the id and permits nothing", () => {
    // The id matters: it is the uuid every foreign key already points at, and
    // signing up keeps it. Nothing is copied anywhere at sign-up because
    // nothing needs to be.
    const ghost = anonymousAccount("8f1c0e4a-0000-4000-8000-000000000002");
    assert.equal(ghost.id, "8f1c0e4a-0000-4000-8000-000000000002");
    assert.deepEqual(ghost.grants, []);
    assert.equal(ghost.assurance, "aal1");
    assert.ok(!ghost.hasSecondFactor);
    assert.ok(!ghost.passwordPending);
    assert.ok(!ghost.trader);
  });
});

describe("closing a report", () => {
  const office = (over: Partial<Organisation> = {}): Organisation => ({
    id: "ps2",
    name: "Primăria Sectorului 2",
    kind: "sector_hall",
    jurisdiction: "sector_2",
    ...over,
  });

  /** A warden who has passed their second factor and acts for an office. */
  const warden = (over: Partial<Account> = {}): Account =>
    account({
      grants: ["resolver"],
      assurance: "aal2",
      organisation: office(),
      ...over,
    });

  const at = (sector?: Jurisdiction) => ({ sector });

  test("a driver may say a kerb is clear and may not resolve", () => {
    /* The whole of #12's `Done when`, on the client side. Both halves matter:
       taking the first away would leave a report open until an institution
       moved, which for a city where no sector hall uses the app yet means
       forever. */
    const driver = account();
    assert.ok(mayClearReport(driver));
    assert.ok(!mayResolveReport(driver, at("sector_2")));
  });

  test("a warden resolves in their own sector", () => {
    assert.ok(mayResolveReport(warden(), at("sector_2")));
  });

  test("and not in somebody else's", () => {
    // A sector hall closing a complaint about another sector's pavement is not
    // a resolution; it is a mistake nobody notices until the car is still
    // there a month later.
    assert.ok(!mayResolveReport(warden(), at("sector_5")));
  });

  test("a city-wide body reaches every sector", () => {
    const mayoralty = warden({
      organisation: office({ id: "pmb", jurisdiction: "city" }),
    });
    for (const sector of SECTOR_JURISDICTIONS) {
      assert.ok(mayResolveReport(mayoralty, at(sector)), sector);
    }
  });

  test("a report the app could not place is reachable by anybody entitled", () => {
    /* Undefined is a real answer, and the safe direction is the permissive
       one: a complaint nobody can be responsible for is worse than one two
       people look at. The database agrees -- see `may_resolve` in 0011. */
    assert.ok(mayResolveReport(warden(), at(undefined)));
  });

  test("a second factor is still required", () => {
    // The office does not replace the rule from #11: a warden who signed in
    // with only a password acts for nobody.
    assert.ok(!mayResolveReport(warden({ assurance: "aal1" }), at("sector_2")));
  });

  test("a resolver with no office resolves nothing", () => {
    /* Which is also how a suspended or expired organisation reads here:
       `acting_organisation()` returns null for all three, so the account comes
       back without one rather than with a dead one. */
    assert.ok(
      !mayResolveReport(warden({ organisation: undefined }), at("sector_2")),
    );
  });

  test("an office without the grant is not authority", () => {
    // A stray column is not permission. `holds` decides first.
    const impostor = account({ organisation: office(), assurance: "aal2" });
    assert.ok(!mayResolveReport(impostor, at("sector_2")));
  });

  test("an anonymous driver may still clear a kerb", () => {
    // Reporting and clearing are both open to somebody who has not signed up:
    // barring them would be barring the only people who walk past.
    assert.ok(mayClearReport(anonymousAccount("me")));
  });
});
