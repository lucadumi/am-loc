/**
 * Tests for lib/jurisdiction.ts.
 *
 * This decides who is responsible for a complaint. Get it wrong and a report
 * about a pavement in Sector 5 is shown to Sector 2, which is not a complaint
 * -- it is a message nobody will act on, filed by somebody who believes they
 * have reported something.
 *
 * The places below are real and checked against the map by hand, because a
 * ray-casting test written against its own output proves nothing: it would
 * pass equally well with the sectors shuffled. What makes this a test rather
 * than a restatement is that Piața Victoriei is in Sector 1 in the world and
 * has to come back as `sector_1` here.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { SECTORS } from "../constants/sectors.ts";
import {
  SECTOR_JURISDICTIONS,
  describeOrganisation,
  jurisdictionLabel,
  organisationKindLabel,
  sectorOf,
  type Jurisdiction,
} from "../lib/jurisdiction.ts";
import type { OrganisationKind } from "../types/index.ts";

/** Somewhere unambiguous in each sector, verified against the map. */
const PLACES: [string, number, number, Jurisdiction][] = [
  ["Piața Victoriei", 44.4518, 26.0854, "sector_1"],
  ["Obor", 44.4456, 26.1253, "sector_2"],
  ["Titan", 44.4136, 26.1484, "sector_3"],
  ["Tineretului", 44.4078, 26.1031, "sector_4"],
  ["Rahova", 44.4101, 26.0651, "sector_5"],
  ["Drumul Taberei", 44.4228, 26.0244, "sector_6"],
];

describe("placing a report", () => {
  for (const [name, latitude, longitude, expected] of PLACES) {
    test(`${name} is in ${expected}`, () => {
      assert.equal(sectorOf(latitude, longitude), expected);
    });
  }

  test("a point outside the city belongs to no sector", () => {
    /* Undefined is a real answer rather than a failure. The database treats
       such a report as reachable by every resolver rather than by none: a
       complaint nobody can be responsible for is worse than one two people
       look at. See `may_resolve` in migration 0011. */
    assert.equal(sectorOf(44.55, 26.07), undefined); // Otopeni
    assert.equal(sectorOf(44.18, 28.65), undefined); // Constanța
  });

  test("the sea is not in Bucharest", () => {
    // The CMPB import carries test rows at the seaside; nothing should place
    // a report there in a sector.
    assert.equal(sectorOf(0, 0), undefined);
  });
});

describe("the boundaries themselves", () => {
  test("all six sectors are present exactly once", () => {
    const found = SECTORS.map((s) => s.jurisdiction).sort();
    assert.deepEqual(found, [...SECTOR_JURISDICTIONS].sort());
  });

  test("every ring is closed", () => {
    /* An open ring makes ray casting answer nonsense rather than fail, which
       is the worst kind of wrong: every point near the gap gets an arbitrary
       answer and nothing anywhere reports a problem. */
    for (const sector of SECTORS) {
      for (const ring of sector.rings) {
        const first = ring[0];
        const last = ring[ring.length - 1];
        assert.deepEqual(first, last, `${sector.jurisdiction} has an open ring`);
      }
    }
  });

  test("every ring has enough points to enclose anything", () => {
    for (const sector of SECTORS) {
      for (const ring of sector.rings) {
        assert.ok(ring.length > 3, `${sector.jurisdiction} has a degenerate ring`);
      }
    }
  });

  test("every point is somewhere near Bucharest", () => {
    // A coordinate pair swapped on the way in would still form a closed ring
    // and would place every report in the Indian Ocean.
    for (const sector of SECTORS) {
      for (const ring of sector.rings) {
        for (const [latitude, longitude] of ring) {
          assert.ok(latitude > 44 && latitude < 45, `latitude ${latitude}`);
          assert.ok(longitude > 25 && longitude < 27, `longitude ${longitude}`);
        }
      }
    }
  });

  test("the boundaries stay small enough to bundle", () => {
    /* They are simplified to about 25 metres for exactly this reason. Left
       raw they are some 40.000 points, which is megabytes of app for a
       question whose answer is one of seven. */
    const points = SECTORS.reduce(
      (sum, s) => sum + s.rings.reduce((n, r) => n + r.length, 0),
      0,
    );
    assert.ok(points < 5000, `${points} points is more than this needs`);
  });
});

describe("naming a jurisdiction", () => {
  test("every value has a label, including the city-wide one", () => {
    for (const key of [...SECTOR_JURISDICTIONS, "city"] as Jurisdiction[]) {
      assert.ok(jurisdictionLabel[key]);
    }
  });
});

describe("naming an institution", () => {
  test("only an actual police authority is called Poliția", () => {
    /* The line the issue is explicit about, and the one somebody would smooth
       over. A label is a claim about power over a driver -- who may stop them,
       fine them, tow them -- and applying it because the word looked
       authoritative is a lie the app tells on somebody else's behalf. */
    const claiming = (["sector_hall", "city_hall", "other"] as OrganisationKind[])
      .filter((kind) => /poli[țt]/i.test(organisationKindLabel[kind]));
    assert.deepEqual(claiming, []);

    assert.match(organisationKindLabel.police, /Poliția/);
    assert.match(organisationKindLabel.local_police, /Poliția/);
  });

  test("a verified body of unknown sort says exactly that", () => {
    assert.equal(organisationKindLabel.other, "Cont instituțional verificat");
  });

  test("the reach is added only when the name does not carry it", () => {
    // "Primăria Sectorului 2 · Sectorul 2" is the app talking to itself.
    assert.equal(
      describeOrganisation({
        name: "Primăria Sectorului 2",
        kind: "sector_hall",
        jurisdiction: "sector_2",
      }),
      "Primăria Sectorului 2",
    );
    assert.equal(
      describeOrganisation({
        name: "Poliția Locală",
        kind: "local_police",
        jurisdiction: "sector_5",
      }),
      "Poliția Locală · Sectorul 5",
    );
  });
});
