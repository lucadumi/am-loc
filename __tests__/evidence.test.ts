/**
 * Tests for lib/evidence.ts.
 *
 * One decision carries this module and it is `isStoredPhoto`: whether a string
 * in a report's photo list names a file already in the bucket or one still on
 * the telephone. It used to be `/^https?:\/\//`, which was right while the
 * column held public URLs, and 0009 made it wrong in a way nothing would have
 * announced.
 *
 * Both directions of getting it wrong are silent and expensive, which is why
 * this file exists for four small functions:
 *
 *   Read as local, a stored photograph is fetched and uploaded again on every
 *   correction, under a new name, leaving the previous file orphaned in a
 *   private bucket with nothing pointing at it and nothing to delete it.
 *
 *   Read as stored, a camera-roll URI is written into the column as though it
 *   were a path, and the evidence for a complaint becomes a string naming a
 *   file on one phone.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  PHOTO_BUCKET,
  SIGNED_URL_TTL_S,
  evidencePath,
  isStoredPhoto,
  reportOfPath,
} from "../lib/evidence.ts";

const OWNER = "8f1c0e4a-0000-4000-8000-000000000001";

describe("telling a stored photograph from a fresh one", () => {
  test("a path has no scheme, and is ours", () => {
    assert.ok(isStoredPhoto(`${OWNER}/r_1/1700000000000-0.jpg`));
  });

  test("what a camera or a gallery hands over is not", () => {
    // The two React Native actually produces. `content://` is the Android one
    // and was the case the old http test got wrong in the quiet direction.
    assert.ok(!isStoredPhoto("file:///var/mobile/tmp/IMG_0001.HEIC"));
    assert.ok(!isStoredPhoto("content://media/external/images/media/42"));
  });

  test("a URL of any kind is not a path", () => {
    /* Including a signed one. A signed URL is what `signEvidence` produces for
       display and must never travel back into the column -- it would be a
       public URL with a slower fuse, which is the thing 0009 removed. */
    assert.ok(!isStoredPhoto("https://x.supabase.co/storage/v1/object/public/report-photos/a/b/c.jpg"));
    assert.ok(!isStoredPhoto("https://x.supabase.co/storage/v1/object/sign/report-photos/a/b/c.jpg?token=ey"));
    assert.ok(!isStoredPhoto("http://example.com/photo.jpg"));
  });

  test("a data URL is not a path either", () => {
    // Never written by this app, and exactly the kind of thing a paste or a
    // future picker would introduce. Uploading it is right; storing the string
    // would put a whole photograph in a text column.
    assert.ok(!isStoredPhoto("data:image/jpeg;base64,/9j/4AAQ"));
  });
});

describe("evidencePath", () => {
  test("owner, report, then a name that cannot collide", () => {
    /* The first two segments are load-bearing: the uuid is what the storage
       policies check, and the report id is what `forget_old_evidence` matches
       on when a report ages out. */
    const path = evidencePath(OWNER, "r_1", "jpg", 0, 1700000000000);
    assert.equal(path, `${OWNER}/r_1/1700000000000-0.jpg`);
  });

  test("two photographs in the same millisecond do not collide", () => {
    const at = 1700000000000;
    assert.notEqual(
      evidencePath(OWNER, "r_1", "jpg", 0, at),
      evidencePath(OWNER, "r_1", "jpg", 1, at),
    );
  });

  test("what it produces reads back as stored", () => {
    // The two functions have to agree, or a photograph is re-uploaded the
    // moment its report is corrected.
    assert.ok(isStoredPhoto(evidencePath(OWNER, "r_1", "png", 2)));
  });
});

describe("reportOfPath", () => {
  test("names the report a path belongs to", () => {
    assert.equal(reportOfPath(`${OWNER}/r_42/1700000000000-0.jpg`), "r_42");
  });

  test("anything not of that shape belongs to no report", () => {
    /* What guards the check in `updateReportRow`: a `text[]` accepts any
       string, so a path from another report would attach somebody else's
       evidence to this complaint while the storage policies stayed perfectly
       happy -- the file is still in its own author's folder. */
    assert.equal(reportOfPath("nonsense"), undefined);
    assert.equal(reportOfPath(`${OWNER}/r_1/nested/deep.jpg`), undefined);
    assert.equal(reportOfPath(""), undefined);
  });

  test("a path from another report is recognisable as such", () => {
    assert.notEqual(reportOfPath(`${OWNER}/r_99/1700000000000-0.jpg`), "r_1");
  });
});

describe("the constants the policies depend on", () => {
  test("the bucket is the one the migrations name", () => {
    assert.equal(PHOTO_BUCKET, "report-photos");
  });

  test("a link expires in minutes, not hours", () => {
    // The point of the expiry is that a leaked link dies. An hour would make
    // one worth copying.
    assert.ok(SIGNED_URL_TTL_S > 0 && SIGNED_URL_TTL_S <= 900);
  });
});
