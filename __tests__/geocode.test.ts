/**
 * Tests for lib/geocode.ts.
 *
 * Everything here is the pure half: turning Nominatim's answer into the list a
 * driver reads, and deciding what is worth a request. The network half is not
 * mocked, because a test that asserts `fetch` was called with a particular
 * query string tests the test, not the app -- what matters is that a caller
 * cannot spend a request on nothing, and that a repeat is answered from memory.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  clearGeocodeCache,
  describePlace,
  isSearchable,
  searchPlaces,
  toPlaces,
} from "../lib/geocode.ts";

const raw = (over: Record<string, unknown> = {}) => ({
  place_id: 1,
  lat: "44.4523",
  lon: "26.0857",
  name: "Piața Victoriei",
  display_name: "Piața Victoriei, Sector 1, București, 010061, România",
  ...over,
});

describe("describing a place", () => {
  test("the feature's own name is the headline", () => {
    const { name, detail } = describePlace(raw() as never);
    assert.equal(name, "Piața Victoriei");
    assert.equal(detail, "Sector 1, București");
  });

  test("an address with no name falls back to its first part", () => {
    /* Nominatim leaves `name` empty for a plain house number, and the first
       comma-separated part is the street and number -- which is exactly the
       headline a driver typed and expects to see back. */
    const { name, detail } = describePlace(
      raw({
        name: "",
        display_name: "12, Strada Lipscani, Sector 3, București, 030167, România",
      }) as never,
    );
    assert.equal(name, "12");
    assert.equal(detail, "Strada Lipscani, Sector 3, București");
  });

  test("the country and the postcode are dropped", () => {
    // "România" on every row is six characters of nothing, and nobody
    // recognises a place they have been to by its postcode.
    const { detail } = describePlace(raw() as never);
    assert.ok(!detail.includes("România"));
    assert.ok(!detail.includes("010061"));
  });

  test("a place with nothing but a name has no detail line", () => {
    const { name, detail } = describePlace(
      raw({ name: "Otopeni", display_name: "Otopeni" }) as never,
    );
    assert.equal(name, "Otopeni");
    assert.equal(detail, "");
  });
});

describe("ordering the answers", () => {
  test("coordinates become numbers", () => {
    const [place] = toPlaces([raw()] as never);
    assert.equal(place.latitude, 44.4523);
    assert.equal(place.longitude, 26.0857);
    assert.equal(place.id, "1");
  });

  test("a broken coordinate is dropped rather than drawn at null island", () => {
    const places = toPlaces([raw({ place_id: 2, lat: "nonsense" })] as never);
    assert.deepEqual(places, []);
  });

  test("the local answer comes first", () => {
    /* A driver in Bucharest searching "Unirii" means the square here. The
       viewbox usually settles it; when it does not, burying the answer under a
       village in another county is worse than reordering. */
    const places = toPlaces([
      raw({ place_id: 9, name: "Unirii", lat: "47.1585", lon: "27.6014" }),
      raw({ place_id: 10, name: "Piața Unirii", lat: "44.4270", lon: "26.1025" }),
    ] as never);
    assert.equal(places[0].name, "Piața Unirii");
  });

  test("but a distant answer is kept", () => {
    // Otopeni and the ring-road retail parks sit outside any box drawn tightly
    // enough to be useful, and a driver asking for one is asking a good
    // question.
    const places = toPlaces([
      raw({ place_id: 11, name: "Aeroportul Otopeni", lat: "44.5711", lon: "26.0850" }),
    ] as never);
    assert.equal(places.length, 1);
  });
});

describe("what is worth a request", () => {
  test("a query too short to mean anything is not one", () => {
    // Nominatim runs on donated hardware and asks for restraint. Two letters
    // match half the city and teach the driver nothing.
    assert.equal(isSearchable("Pi"), false);
    assert.equal(isSearchable("  "), false);
    assert.equal(isSearchable("Piața"), true);
  });

  test("and produces no results without reaching the network", async () => {
    clearGeocodeCache();
    /* No fetch is stubbed here on purpose: if this ever called out, the test
       would fail with a network error rather than pass quietly. */
    assert.deepEqual(await searchPlaces("Pi"), []);
  });
});
