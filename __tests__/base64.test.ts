/**
 * Tests for the base64 decoder.
 *
 * It is twenty lines of bit-shifting standing between a photograph on a phone
 * and the evidence attached to a civic complaint, and it is exactly the sort
 * of code that appears to work: a decoder that drops the last group still
 * produces an image, just a slightly truncated one, and nobody notices until
 * somebody needs to read a number plate at the edge of the frame.
 *
 * So the cases here are the boundaries of the four-characters-to-three-bytes
 * grouping, where a wrong `>>` costs the tail of every upload.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { decodeBase64, decodeDataUrl } from "../lib/base64.ts";

const text = (bytes: Uint8Array) => Buffer.from(bytes).toString("utf8");

describe("decoding base64", () => {
  test("a whole group of three bytes", () => {
    assert.equal(text(decodeBase64("YWJj")), "abc");
  });

  test("one byte left over, two pad characters", () => {
    assert.equal(text(decodeBase64("YQ==")), "a");
  });

  test("two bytes left over, one pad character", () => {
    assert.equal(text(decodeBase64("YWI=")), "ab");
  });

  test("padding is optional", () => {
    assert.equal(text(decodeBase64("YQ")), "a");
  });

  test("the whole alphabet round-trips", () => {
    const source = Buffer.from(
      Array.from({ length: 256 }, (_, i) => i),
    );
    assert.deepEqual(
      Buffer.from(decodeBase64(source.toString("base64"))),
      source,
    );
  });

  test("the URL-safe alphabet decodes to the same bytes", () => {
    const source = Buffer.from([251, 255, 190]);
    assert.deepEqual(
      Buffer.from(decodeBase64(source.toString("base64url"))),
      source,
    );
  });

  test("line breaks from a wrapped encoder are ignored", () => {
    assert.equal(text(decodeBase64("YWJj\nZGVm\n")), "abcdef");
  });

  test("an empty string is no bytes rather than an error", () => {
    assert.equal(decodeBase64("").length, 0);
  });

  test("anything that is not base64 is refused", () => {
    // Skipping the character quietly would turn a corrupt photograph into a
    // shorter photograph, which nothing downstream could detect.
    assert.throws(() => decodeBase64("YWJ$"), /Not base64/);
  });
});

describe("decoding a data URL", () => {
  test("gives back the bytes and what the platform called them", () => {
    const decoded = decodeDataUrl("data:image/png;base64,YWJj");

    assert.equal(decoded.contentType, "image/png");
    assert.equal(text(decoded.bytes), "abc");
  });

  test("a type-less data URL still decodes", () => {
    assert.equal(text(decodeDataUrl("data:;base64,YWJj").bytes), "abc");
  });

  test("something that is not a data URL is refused", () => {
    assert.throws(() => decodeDataUrl("file:///photo.jpg"), /Not a data URL/);
  });
});
