/**
 * What `0014_erasure_is_final.sql` promises, read out of the migrations.
 *
 * Two halves, and both are lists that have to be complete rather than merely
 * present. The barrier adds one line to every policy that lets somebody write,
 * and it is worth nothing unless it is on *every* one of them: a single table
 * that still accepts inserts while an erasure is pending is the whole hole
 * again, and it is invisible -- nothing fails, a row simply outlives an account
 * that asked to be closed. The second pass is one function with two callers,
 * and the whole point of it is that the second caller runs the same deletions
 * as the first.
 *
 * That is not a thing a reader can check. The policies are spread over seven
 * files, each one is written twice (where it was born, and again in `0014`),
 * and the version that is actually in force is the last one to run. So this
 * test does what a reader would have to: it replays the migrations in order,
 * keeps the last definition of each policy, and asks the surviving write
 * policies whether they stop.
 *
 * WHY IT PARSES SQL. The alternative is a list of policy names in a test file,
 * which is the same list of things to remember that the barrier exists to stop
 * anybody having to remember. A migration in six months that adds a table with
 * an insert policy fails this test without its author having to know the test
 * is here, which is the only way a rule like this stays true.
 *
 * The database itself is not exercised anywhere in this suite -- there is no
 * Postgres in CI, by the same argument as `ci.yml` makes about simulators. So
 * this is a check on the text, and it can say the barrier is written; it
 * cannot say Postgres enforces it. What it does catch is the one failure that
 * has actually happened here: a rule applied to some of the places it has to
 * cover and not the rest.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

const MIGRATIONS = join(import.meta.dirname, "..", "supabase", "migrations");

/** The migrations, in the order Postgres runs them. */
function migrations(): { file: string; sql: string }[] {
  return readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(MIGRATIONS, file), "utf8") }));
}

/**
 * The SQL with its comments taken out.
 *
 * Needed rather than tidy: these files carry more prose than statements, the
 * prose quotes policies and names tables, and a parser that read it would find
 * policies that do not exist -- `0008` discusses `create policy` in a sentence.
 */
function withoutComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

interface Policy {
  name: string;
  table: string;
  command: string;
  roles: string;
  body: string;
  file: string;
}

/**
 * Every `create policy` in a file.
 *
 * A policy definition runs to the first semicolon and contains none of its own,
 * which is what makes this crude split safe. `to <roles>` is optional in
 * Postgres and defaults to `public`; the group after `for` is likewise
 * optional and defaults to `all`.
 */
function policiesIn(file: string, sql: string): Policy[] {
  const found: Policy[] = [];
  const create =
    /create\s+policy\s+"([^"]+)"\s+on\s+([\w.]+)(?:\s+as\s+\w+)?(?:\s+for\s+(\w+))?(?:\s+to\s+([\w\s,]+?))?\s*(using|with\s+check)([\s\S]*?);/gi;

  for (const match of withoutComments(sql).matchAll(create)) {
    found.push({
      name: match[1],
      table: match[2].toLowerCase(),
      command: (match[3] ?? "all").toLowerCase(),
      roles: (match[4] ?? "public").toLowerCase(),
      body: `${match[5]}${match[6]}`,
      file,
    });
  }
  return found;
}

/** Tables a later migration drops. Their policies went with them. */
function droppedTables(files: { sql: string }[]): Set<string> {
  const gone = new Set<string>();
  for (const { sql } of files) {
    for (const match of withoutComments(sql).matchAll(
      /drop\s+table\s+(?:if\s+exists\s+)?([\w.]+)/gi,
    )) {
      gone.add(match[1].toLowerCase());
    }
  }
  return gone;
}

/**
 * The policies actually in force, by (table, name), last definition winning.
 *
 * That is how every policy in this project is edited: `drop policy if exists`
 * and then `create policy` under the same name in a later file. Reading only
 * the last one is the difference between testing the schema and testing its
 * history.
 */
function inForce(): Policy[] {
  const files = migrations();
  const dropped = droppedTables(files);
  const live = new Map<string, Policy>();

  for (const { file, sql } of files) {
    for (const policy of policiesIn(file, sql)) {
      live.set(`${policy.table}:${policy.name}`, policy);
    }
  }

  return [...live.values()].filter((policy) => !dropped.has(policy.table));
}

/**
 * Policies a signed-in person can write through.
 *
 * `public` counts as well as `authenticated`, and that is not pedantry: a
 * policy with no `to` clause defaults to `public`, which every signed-in
 * caller is a member of. Reading only the explicit `to authenticated` ones
 * would let the next unbarriered insert policy through for having been written
 * in the shorter style.
 */
function writePolicies(policies: Policy[] = inForce()): Policy[] {
  return policies.filter(
    (policy) =>
      ["insert", "update", "all"].includes(policy.command) &&
      (policy.roles.includes("authenticated") || policy.roles.includes("public")),
  );
}

describe("the parser", () => {
  // Everything below is an assertion about a list, so an empty list would pass
  // all of it. These are the tests of the test.
  test("it finds the policies that are there", () => {
    const live = inForce();
    assert.ok(live.length > 20, `only found ${live.length} policies`);
    assert.ok(live.some((p) => p.table === "public.reports" && p.command === "select"));
    assert.ok(live.some((p) => p.table === "storage.objects"));
  });

  test("it reads the last definition of a policy, not the first", () => {
    const upload = inForce().find(
      (p) => p.table === "storage.objects" && p.name === "A driver uploads into their own folder",
    );
    // Born in `0004`, tightened in `0013`, and moved onto the function in
    // `0014`. A parser that kept the first would see no barrier at all.
    assert.equal(upload?.file, "0014_erasure_is_final.sql");
  });

  test("it does not resurrect a dropped table", () => {
    // `status_reports` had an insert policy in `0001` and was dropped in
    // `0007`. Demanding a barrier on it would be unsatisfiable.
    assert.ok(!inForce().some((p) => p.table === "public.status_reports"));
  });

  test("it ignores policies that are only talked about", () => {
    assert.ok(!inForce().some((p) => p.name.includes("has no")));
  });

  test("a policy with no `to` clause is not overlooked", () => {
    // `to` is optional and defaults to `public`, which every signed-in caller
    // belongs to. A barrier that only inspected the explicit
    // `to authenticated` ones would wave the shorter style straight through.
    const hypothetical = policiesIn(
      "0099_hypothetical.sql",
      `create policy "Anybody writes" on public.whatever for insert
         with check (true);`,
    );

    assert.equal(hypothetical[0].roles, "public");
    assert.equal(writePolicies(hypothetical).length, 1);
  });
});

describe("a pending erasure stops the writing", () => {
  test("every write a signed-in person can make asks", () => {
    const open = writePolicies().filter((policy) => !policy.body.includes("being_erased()"));

    assert.deepEqual(
      open.map((policy) => `${policy.table}: ${policy.name} (${policy.file})`),
      [],
      "these policies still accept writes from somebody who asked to be forgotten",
    );
  });

  test("the barrier covers the tables the header names", () => {
    // Named one at a time as well as counted, because the check above is
    // satisfied by an empty list and because these are the two the header of
    // `0014` argues about: the row that outlives the login, and the row that
    // says where a person sleeps.
    const barriered = new Set(writePolicies().map((policy) => policy.table));

    for (const table of [
      "public.spots",
      "public.parkings",
      "public.reports",
      "public.report_events",
      "public.availability_windows",
      "public.profiles",
      "storage.objects",
    ]) {
      assert.ok(barriered.has(table), `${table} has no write policy to stop`);
    }
  });

  test("it is checked on the way in, not on the way out", () => {
    // In `with check`, so a refused write raises. In `using` it would match no
    // rows and the screen would show a button that quietly did nothing.
    for (const policy of writePolicies()) {
      const check = policy.body.slice(policy.body.search(/with\s+check/i));
      assert.ok(
        check.includes("being_erased()"),
        `${policy.name} keeps the barrier outside its with check`,
      );
    }
  });

  test("deleting your own rows is still allowed", () => {
    // The other half of the rule, and the easier one to break by being
    // thorough: an erasure that stopped somebody deleting things would be an
    // erasure that got in its own way.
    const deletes = inForce().filter(
      (policy) => policy.command === "delete" && policy.roles.includes("authenticated"),
    );

    assert.ok(deletes.length > 0);
    for (const policy of deletes) {
      assert.ok(
        !policy.body.includes("being_erased()"),
        `${policy.name} refuses a deletion during an erasure`,
      );
    }
  });

  test("reading is untouched", () => {
    const reads = inForce().filter((policy) => policy.command === "select");

    assert.ok(reads.length > 0);
    for (const policy of reads) {
      assert.ok(
        !policy.body.includes("being_erased()"),
        `${policy.name} hides rows from somebody mid-erasure`,
      );
    }
  });
});

describe("the function the policies call", () => {
  const sql = withoutComments(
    readFileSync(join(MIGRATIONS, "0014_erasure_is_final.sql"), "utf8"),
  );

  test("it reads the request as the definer", () => {
    // The whole argument for the function over the subquery `0013` inlined: as
    // the caller it would depend on the select policy on `erasure_requests`
    // staying as wide as it is, and would pass silently if it ever narrowed.
    const declaration = sql.slice(sql.indexOf("create or replace function public.being_erased"));
    const head = declaration.slice(0, declaration.indexOf("$$"));

    assert.match(head, /security\s+definer/i);
    assert.match(head, /set\s+search_path\s*=\s*''/i);
    assert.match(head, /\bstable\b/i);
  });

  test("a client may ask, and only ask", () => {
    assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.being_erased\(\)\s+from\s+public/i);
    assert.match(
      sql,
      /grant\s+execute\s+on\s+function\s+public\.being_erased\(\)\s+to\s+anon,\s*authenticated/i,
    );
  });
});

describe("the second pass", () => {
  const sql = withoutComments(
    readFileSync(join(MIGRATIONS, "0014_erasure_is_final.sql"), "utf8"),
  );
  const worker = readFileSync(
    join(import.meta.dirname, "..", "supabase", "functions", "retention", "index.ts"),
    "utf8",
  );

  /** A function's body, from its declaration to the dollar quote that ends it. */
  function bodyOf(name: string): string {
    const start = sql.indexOf(`create or replace function public.${name}`);
    assert.notEqual(start, -1, `${name} is not declared in 0014`);
    const end = sql.indexOf("$$;", start);
    return sql.slice(start, end);
  }

  test("there is one definition of what an erasure deletes", () => {
    // The reason the body moved out of `erase_me` at all: the job has to be
    // able to run it again, and two copies of a deletion list is how one of
    // them comes to be missing a table.
    const eraseMe = bodyOf("erase_me");

    assert.match(eraseMe, /public\.forget_everything\(me\)/);
    assert.doesNotMatch(eraseMe, /delete\s+from/i);
  });

  test("it still deletes everything it used to", () => {
    const body = bodyOf("forget_everything");

    for (const table of [
      "public.reports",
      "public.availability_windows",
      "public.parkings",
      "public.spots",
      "public.report_events",
      "public.user_roles",
      "public.profiles",
    ]) {
      assert.ok(body.includes(table), `${table} is no longer touched by an erasure`);
    }
  });

  test("the receipt keeps the shape the screen reads", () => {
    // `ErasureReceipt` in lib/privacy.ts and `receiptLines` under it. A key
    // renamed here shows up as a silently missing line in the dialog somebody
    // is shown once, at the moment their account goes.
    const body = bodyOf("forget_everything");

    for (const key of [
      "reports_deleted",
      "availability_windows_deleted",
      "private_spots_deleted",
      "parkings_deleted",
      "actions_kept_unattributed",
      "storage_prefix",
      "login_and_photos_pending",
    ]) {
      assert.ok(body.includes(key), `the receipt lost ${key}`);
    }
  });

  test("a name goes from a spot somebody merely added", () => {
    // `0012` cleared `owner_name` where `owner_id = who`, and `0010` requires a
    // `public_facility` to have no owner -- so the one kind of spot whose name
    // was reachable by that rule was the kind the line above already deletes,
    // and the kind it could not reach kept the name in public for good.
    //
    // `owner_id is null and` is the load-bearing half. `created_by` was
    // editable by whoever owned a spot, so reading it on a row that somebody
    // else owns lets one person aim another person's erasure: at a stranger's
    // permit, quietly, or at a stranger's `private_property`, which would make
    // this statement violate `spots_property_has_an_owner` and leave the person
    // unable to erase anything at all.
    assert.match(
      bodyOf("forget_everything"),
      /set\s+owner_id\s*=\s*null,\s*owner_name\s*=\s*null\s+where\s+owner_id\s*=\s*who\s+or\s+\(owner_id\s+is\s+null\s+and\s+created_by\s*=\s*who\)/i,
    );
  });

  test("an author can be given up but not taken", () => {
    // The other half, and the one that makes `created_by` worth reading at all.
    // Null has to pass: severing the author is what the erasure itself does.
    const trigger = bodyOf("spots_keep_their_author");

    assert.match(trigger, /new\.created_by\s+is\s+not\s+null/i);
    assert.match(trigger, /is\s+distinct\s+from\s+old\.created_by/i);
    assert.match(trigger, /raise\s+exception/i);
    assert.match(
      sql,
      /create\s+trigger\s+spots_keep_their_author\s+before\s+update\s+on\s+public\.spots/i,
    );
  });

  test("nothing is finished while a write could still be in the air", () => {
    // An upload is authorised when it starts and a signed URL when it is
    // minted, so no policy can refuse one taken out before the request. The
    // only answer is to wait longer than the longest of them lives, and
    // `0013` prints the cron time for anybody who wanted to aim at it.
    const pending = bodyOf("pending_erasures");

    assert.match(pending, /requested_at\s*<\s*now\(\)\s*-\s*interval\s*'(\d+) hours'/i);
    const hours = Number(pending.match(/interval\s*'(\d+) hours'/i)?.[1]);
    assert.ok(hours >= 3, `${hours} hours does not outlive a two-hour upload token`);
  });

  test("the job looks again after it has finished", () => {
    // Three hours outlives an authorisation given before the request; it does
    // not bound one, because a storage request is authorised when it starts.
    // Nothing here can refuse a file that lands after the erasure was closed,
    // so the job goes back and looks -- and counts what it finds apart from
    // the ordinary sweep.
    assert.match(worker, /supabase\.rpc\("finished_erasures"\)/);
    assert.match(worker, /run\.photos_after_the_end\s*\+=/);

    const pending = worker.indexOf("recheckFinishedErasures(supabase, run, failures)");
    const finishing = worker.indexOf("finishErasures(supabase, run, failures)");
    assert.ok(finishing > -1 && pending > finishing, "the recheck runs before the sweep it checks");
  });

  test("the watch cannot be ended by the job being down", () => {
    // A window of time is only a window if the job runs. Seven days of nights
    // is nothing at all across an eight-day outage: everything closed before
    // it would age out having never been looked at, silently, and that is the
    // failure this shape exists to make impossible.
    const finished = bodyOf("finished_erasures");

    assert.match(finished, /completed_at\s+is\s+not\s+null/i);
    assert.match(finished, /quiet_nights\s*<\s*nights/i);
    assert.doesNotMatch(finished, /completed_at\s*>\s*now\(\)/i);

    const nights = Number(finished.match(/nights\s+integer\s+default\s+(\d+)/i)?.[1]);
    assert.ok(nights >= 2, `${nights} quiet night is one listing, not a watch`);
  });

  test("a night that finds something starts the count again", () => {
    // The question the count answers is whether the prefix has been still
    // since the last thing arrived, not how long ago the person left.
    assert.match(
      bodyOf("record_a_recheck"),
      /quiet_nights\s*=\s*case\s+when\s+anything_found\s+then\s+0\s+else\s+quiet_nights\s*\+\s*1\s+end/i,
    );
  });

  test("a night that could not look is not a quiet night", () => {
    // `emptyPrefix` answers "something" when a listing fails, because not
    // knowing is not the same as nothing. Counting that as quiet would end the
    // watch on the strength of a storage outage.
    const recheck = worker.slice(worker.indexOf("async function recheckFinishedErasures"));

    assert.match(recheck, /if\s*\(late\.left\s*>\s*0\)\s*continue;/);
    assert.ok(
      recheck.indexOf("if (late.left > 0) continue;") <
        recheck.indexOf('supabase.rpc("record_a_recheck"'),
      "the night is written down before it is known to have been quiet",
    );
  });

  test("the uuid version is the service key's alone", () => {
    // It takes a uuid, so execute on it is a licence to erase anybody.
    assert.match(
      sql,
      /revoke\s+all\s+on\s+function\s+public\.forget_everything\(uuid\)\s+from\s+public,\s*anon,\s*authenticated/i,
    );
    assert.match(
      sql,
      /grant\s+execute\s+on\s+function\s+public\.forget_everything\(uuid\)\s+to\s+service_role/i,
    );
    assert.doesNotMatch(
      sql,
      /grant\s+execute\s+on\s+function\s+public\.forget_everything\(uuid\)\s+to\s+(anon|authenticated)/i,
    );
  });

  test("the job runs it before it deletes the login", () => {
    // Load-bearing, and not only for the race: `spots_property_has_an_owner` in
    // `0010` means a private spot that outlives `erase_me` makes the
    // `auth.users` delete fail, every night, for good.
    const finishing = worker.slice(worker.indexOf("async function finishErasures"));
    const again = finishing.indexOf("forget_everything");
    const login = finishing.indexOf("deleteUser");

    assert.ok(again > -1, "the job never re-runs the deletions");
    assert.ok(login > -1 && again < login, "the login goes before the rows do");
  });
});
