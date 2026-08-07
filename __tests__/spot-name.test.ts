/**
 * Tests for lib/spot-name.ts.
 *
 * Worth testing on its own because the rule is a regex over other people's
 * data, and the interesting cases are all false positives: Bucharest is full of
 * places whose names contain "parc" without being car parks. Getting those
 * wrong is invisible on 778 correct rows and embarrassing on the four that are
 * not.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { spotName } from "../lib/spot-name.ts";

const named = (title: string) => spotName({ title });

describe("naming a car park a driver can recognise", () => {
  test("a bare place name is labelled", () => {
    // How CMPB records nearly every one of its lots.
    assert.equal(named("Academiei"), "Parcare Academiei");
    assert.equal(named("Lido"), "Parcare Lido");
    assert.equal(named("Ministerul Mediului"), "Parcare Ministerul Mediului");
  });

  test("a name that already says so is left alone", () => {
    assert.equal(named("Parcare supraetajată"), "Parcare supraetajată");
    assert.equal(named("Parcare subterană"), "Parcare subterană");
    assert.equal(
      named("A.D.P. SECTOR 2 PARCARE DE RESEDINTA"),
      "A.D.P. SECTOR 2 PARCARE DE RESEDINTA",
    );
  });

  test("the declined forms count as saying so", () => {
    assert.equal(named("Parcarea Mall"), "Parcarea Mall");
    assert.equal(named("Parcării Nord"), "Parcării Nord");
  });

  test("English names from OpenStreetMap count too", () => {
    assert.equal(named("Parking Center"), "Parking Center");
  });

  /* The whole reason the pattern stops at `parc[ăa]r`. These are real names
     from the two imports -- a street, a boyar's title, and two lots by a park
     -- and every one of them contains "parc" without being the word. Matched
     loosely, they would be the only four car parks in the city left unlabelled. */
  test("a place merely near a park is still labelled", () => {
    assert.equal(named("Parcului"), "Parcare Parcului");
    assert.equal(named("Parcalabul Baldovin"), "Parcare Parcalabul Baldovin");
    assert.equal(named("Gara Parc"), "Parcare Gara Parc");
    assert.equal(
      named("Mircea Voda Parc Timpuri Noi"),
      "Parcare Mircea Voda Parc Timpuri Noi",
    );
  });

  test("a name that is only whitespace does not become a dangling prefix", () => {
    assert.equal(named("   "), "Parcare");
    assert.equal(named(""), "Parcare");
  });

  test("surrounding whitespace is not carried into the label", () => {
    assert.equal(named("  Batistei  "), "Parcare Batistei");
  });
});
