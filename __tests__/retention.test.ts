/**
 * Tests for supabase/functions/_shared/retention.ts.
 *
 * The job these back up deletes photographs and logins, on a schedule, with
 * nobody watching. Nothing in the app will notice if it does its work badly:
 * both of its failure modes are invisible from the inside and both are the
 * kind you find out about from somebody else.
 *
 *   A path cleared while its file survives leaves a photograph of somebody's
 *   car outside somebody's house in a bucket that nothing in the database
 *   names any more. Nothing will ever delete it, because nothing knows it is
 *   there. The job clears by path rather than by report so that a page
 *   boundary cannot cause it; `keepSweeping` is what decides when to ask for
 *   the next page and when the paths coming back are a wall rather than a
 *   backlog.
 *
 *   A login deleted while the pictures survive is worse and quieter: after the
 *   `auth.users` row goes, the prefix is a uuid belonging to nobody, and there
 *   is no longer anything in this system that could tell you whose it was.
 *   `loginMayGo` is one line, and it is the line between "erased" and "told
 *   they were erased".
 *
 * So the cases below are mostly about what happens when the storage API only
 * half works, which is the state the job spends its interesting nights in.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  bearerOf,
  chunk,
  emptyRun,
  keepSweeping,
  loginMayGo,
  pathsUnder,
  runLines,
  sameSecret,
} from "../supabase/functions/_shared/retention.ts";

describe("batching what gets deleted", () => {
  test("nothing is lost and no batch is over the limit", () => {
    const items = Array.from({ length: 250 }, (_, at) => at);
    const batches = chunk(items, 100);

    assert.equal(batches.length, 3);
    assert.deepEqual(
      batches.map((batch) => batch.length),
      [100, 100, 50],
    );
    assert.deepEqual(batches.flat(), items);
  });

  test("an empty list is no calls at all, not one empty call", () => {
    assert.deepEqual(chunk([], 100), []);
  });

  test("a batch of nothing is refused rather than looping forever", () => {
    assert.throws(() => chunk([1, 2], 0), RangeError);
  });
});

describe("sweeping the expired photographs", () => {
  test("another page is asked for while something is moving", () => {
    assert.equal(keepSweeping(500, 0), true);
    assert.equal(keepSweeping(1, 5), true);
  });

  test("a pass that cleared nothing stops rather than asking again", () => {
    // The wall, not the backlog: the same undeletable paths come back looking
    // exactly like new work, and the loop would never end.
    assert.equal(keepSweeping(0, 0), false);
  });

  test("there is a ceiling on how long one night may go on", () => {
    assert.equal(keepSweeping(500, 19), false);
  });
});

describe("walking somebody's prefix", () => {
  test("folders are told from files by the missing id", () => {
    const under = pathsUnder("4f9f/", [
      { name: "r_1700000000_ab", id: null },
      { name: ".emptyFolderPlaceholder", id: "obj-1" },
    ]);

    assert.deepEqual(under.folders, ["4f9f/r_1700000000_ab"]);
    assert.deepEqual(under.files, ["4f9f/.emptyFolderPlaceholder"]);
  });

  test("the prefix's trailing slash never doubles", () => {
    const withSlash = pathsUnder("4f9f/", [{ name: "one.jpg", id: "obj-1" }]);
    const without = pathsUnder("4f9f", [{ name: "one.jpg", id: "obj-1" }]);

    assert.deepEqual(withSlash.files, ["4f9f/one.jpg"]);
    assert.deepEqual(without.files, ["4f9f/one.jpg"]);
  });

  test("a report folder joins onto the path already walked", () => {
    const under = pathsUnder("4f9f/r_1700000000_ab/", [
      { name: "1700000000-0.jpg", id: "obj-1" },
      { name: "1700000000-1.jpg", id: "obj-2" },
    ]);

    assert.deepEqual(under.files, [
      "4f9f/r_1700000000_ab/1700000000-0.jpg",
      "4f9f/r_1700000000_ab/1700000000-1.jpg",
    ]);
    assert.deepEqual(under.folders, []);
  });

  test("an empty page is neither a file nor a folder", () => {
    assert.deepEqual(pathsUnder("4f9f/", []), { files: [], folders: [] });
  });

  test("an entry with no name is skipped rather than deleting the folder", () => {
    // Storage has been known to answer with a blank row; joining it would
    // produce the prefix itself as a path to delete.
    const under = pathsUnder("4f9f/", [{ name: "", id: "obj-1" }]);

    assert.deepEqual(under, { files: [], folders: [] });
  });
});

describe("whether the login may go", () => {
  test("only when a fresh listing found nothing", () => {
    assert.equal(loginMayGo(0), true);
    assert.equal(loginMayGo(1), false);
  });
});

describe("who may call the job", () => {
  test("the service key gets in", () => {
    assert.equal(sameSecret("sb_secret_abc", "sb_secret_abc"), true);
  });

  test("a driver's own token does not", () => {
    assert.equal(sameSecret("eyJhbGciOi.a-real-user", "sb_secret_abc"), false);
  });

  test("no token, an empty one and a prefix of the key are all refused", () => {
    assert.equal(sameSecret("", "sb_secret_abc"), false);
    assert.equal(sameSecret("sb_secret_ab", "sb_secret_abc"), false);
    assert.equal(sameSecret("sb_secret_abc", ""), false);
  });

  test("the header is read the way clients actually send it", () => {
    assert.equal(bearerOf("Bearer sb_secret_abc"), "sb_secret_abc");
    assert.equal(bearerOf("bearer   sb_secret_abc  "), "sb_secret_abc");
    assert.equal(bearerOf(null), "");
    assert.equal(bearerOf("sb_secret_abc"), "");
    assert.equal(bearerOf("Basic sb_secret_abc"), "");
  });
});

describe("what the run says afterwards", () => {
  test("a quiet night says so rather than saying nothing", () => {
    assert.deepEqual(runLines(emptyRun()), ["Nothing was due."]);
  });

  test("singular and plural are both written out", () => {
    const lines = runLines({
      ...emptyRun(),
      photos_removed: 1,
      reports_touched: 2,
      erasures_finished: 1,
    });

    assert.deepEqual(lines, [
      "1 photograph removed.",
      "2 reports had expired photo paths cleared.",
      "1 erasure finished.",
    ]);
  });

  test("what did not happen is in the log too", () => {
    const lines = runLines({
      ...emptyRun(),
      photos_removed: 40,
      photos_left: 3,
      erasures_incomplete: 1,
    });

    assert.deepEqual(lines, [
      "40 photographs removed.",
      "3 photographs could not be removed, and will be tried again.",
      "1 erasure left open: the pictures are still there, so the login stays.",
    ]);
  });

  test("a photograph that arrived after the end is said apart", () => {
    // Not folded into `photos_removed`, and this is the whole reason it is a
    // separate number: an upload authorised before an erasure cannot be
    // refused afterwards, only found later, and finding one means somebody was
    // told their photographs were gone while one of them was still arriving.
    // A total that a quiet night can also produce would hide it.
    const lines = runLines({ ...emptyRun(), photos_removed: 2, photos_after_the_end: 1 });

    assert.equal(lines.length, 2);
    assert.equal(lines[0], "2 photographs removed.");
    assert.match(lines[1], /^1 photograph arrived after an erasure was closed/);
  });
});
