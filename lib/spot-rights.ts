/**
 * What kind of place a parking space is, and what that entitles anybody to do
 * with it.
 *
 * The app used to hold one bit about this: `public` or `private`, meaning
 * roughly "somebody owns it or nobody does". That was enough while the only
 * question was who may say whether a space is free. It is not enough now, and
 * the reason is legal rather than architectural.
 *
 * ---
 *
 * THREE KINDS, BECAUSE ROMANIAN LAW TREATS THEM AS THREE.
 *
 * A `private_property` space is property. It may be lent or let: Cod Civil for
 * the general case, Legea 196/2018 where it sits inside a residents'
 * association, whose own rules may still restrict subletting a commonly-held
 * one. Money may change hands.
 *
 * A `public_facility` space is public road or a car park operated on it.
 * "Reserving" one or handing it on carries a contravention fine of 500-2.500
 * lei, and obstructing a public road reaches art. 339 Cod Penal. This is the
 * rock MonkeyParking ran onto in San Francisco, and Romanian law is if
 * anything plainer about it.
 *
 * A `residential_permit` space is the one the old two-value model could not
 * express, and the one most likely to be got wrong. It is a marked space on a
 * public street that a resident holds a permit for -- CMPB and the sector halls
 * allocate thousands of them. The permit is a right to *park*, granted to a
 * person; it is not ownership of the asphalt, and it does not carry a right to
 * sell or sublet what the city allocated. Under the old model these were
 * either mislabelled `public` -- and so invisible to the person who actually
 * holds them -- or mislabelled `private`, which would have opened a paid
 * sharing flow over municipal property.
 *
 * That second mistake is what `Done when` on the issue is about, and it is why
 * this is a total function over the union rather than a boolean: adding a
 * fourth kind of place forces somebody to answer every question below out
 * loud, instead of inheriting an answer that happened to be false.
 *
 * ---
 *
 * WHY THE CAPABILITIES ARE DERIVED RATHER THAN STORED. A column saying
 * `paid_sharing_allowed` is a column somebody can set. The whole value of this
 * module is that no row anywhere carries permission -- permission is computed
 * from what the place *is*, in one expression, and a screen that wants to know
 * whether to draw a "rent this out" button asks here rather than remembering.
 *
 * Pure, with no runtime imports, so `node --test` loads it.
 */

/**
 * Who controls a space, and therefore what may lawfully be done with it.
 *
 * The values are deliberately nouns about the place rather than adjectives
 * about access: `public` and `private` invited the reading "open to all" and
 * "restricted", which is about who may drive in, and the question here is who
 * holds the right.
 */
export type SpotAccess =
  /** Public road, or a car park operated on it. Belongs to everybody. */
  | "public_facility"
  /** Somebody's property: a garage, a yard, a bay on private land. */
  | "private_property"
  /**
   * A marked space on a public street allocated to a resident by permit.
   *
   * The permit holder may park there. They do not own the ground, and nothing
   * about the allocation lets them sell what the city gave them.
   */
  | "residential_permit";

/** Every kind of place, for a caller that has to handle all of them. */
export const SPOT_ACCESS: readonly SpotAccess[] = [
  "public_facility",
  "private_property",
  "residential_permit",
] as const;

/**
 * What may be done with a place, derived from what it is.
 *
 * Note what is absent: `observable`, which used to mean "strangers may file
 * status reports about this". Nothing is observable by anybody since the
 * belief model and `status_reports` were removed -- nobody is asked, so the
 * capability would be false everywhere and would read as a feature that had
 * been switched off rather than one that does not exist.
 */
export interface SpotRights {
  /** Appears in search and on the map. */
  discoverable: boolean;
  /** A driver may hold it in advance. */
  reservable: boolean;
  /** Money may lawfully change hands for it. */
  paidSharingAllowed: boolean;
  /** Whoever lists it must prove their right to. */
  verificationRequired: boolean;
  /**
   * Whether a free-space count for this place would be a fact.
   *
   * The distinction the app's honesty rests on. An owner who controls their
   * own gate knows whether their space is taken, and so does a barrier feeding
   * an occupancy interface; everywhere else a count is a guess, and the app
   * would rather say nothing than draw a number nobody counted.
   *
   * False for a public facility *today*, and that is the one entry here likely
   * to change: an operator car park whose barrier feeds #24 is a public
   * facility where the count is a fact. When that arrives it becomes a
   * property of the individual place rather than of its kind, which is why
   * `rightsOf` takes a spot and not a bare `SpotAccess`.
   */
  exactCount: boolean;
}

/**
 * The rights each kind of place carries.
 *
 * Written out in full rather than computed from one another, because the
 * interesting cases are exactly the ones a rule would get wrong. A residential
 * permit looks like a private space from the driver's seat and like a public
 * one from the land registry, and the two lines that matter --
 * `paidSharingAllowed` and `verificationRequired` -- take one value from each.
 */
const RIGHTS: Record<SpotAccess, SpotRights> = {
  /* Everything the city publishes, and nothing anybody may trade. */
  public_facility: {
    discoverable: true,
    reservable: false,
    paidSharingAllowed: false,
    verificationRequired: false,
    exactCount: false,
  },

  /* The only kind money may be asked for, and therefore the only kind whose
     lister has to prove they are entitled to list it. */
  private_property: {
    discoverable: true,
    reservable: true,
    paidSharingAllowed: true,
    verificationRequired: true,
    exactCount: true,
  },

  /**
   * Discoverable and verified, and nothing else -- for now.
   *
   * `paidSharingAllowed` is false and is not a placeholder: selling a space
   * the city allocated is the offence described in this module's header, and
   * no pilot changes that. `reservable` is false because a permit holder
   * lending their space to a neighbour needs the sector hall's agreement to be
   * anything other than an arrangement between two people -- that is #23, and
   * this is the line it would have to move deliberately.
   *
   * `verificationRequired` is true even though nothing may be sold: the permit
   * is what makes somebody entitled to speak for the space at all, and a space
   * listed by whoever claimed it first would be the same failure as an
   * unverified private listing with a smaller blast radius.
   */
  residential_permit: {
    discoverable: true,
    reservable: false,
    paidSharingAllowed: false,
    verificationRequired: true,
    exactCount: false,
  },
};

/**
 * The least this module needs to know about a place.
 *
 * Declared here rather than importing `ParkingSpot` from `@/types`, so the
 * rights model stays a leaf: it is the thing types depend on, not the other
 * way round, and `SpotAccess` itself lives here.
 */
interface HasAccess {
  access: SpotAccess;
}

/**
 * What may be done with this particular place.
 *
 * Takes a spot rather than a bare `SpotAccess` on purpose. Every answer today
 * comes from the kind alone, and one of them will not: an operator car park
 * with a barrier is a `public_facility` whose count is a fact, and when #24
 * adds that feed only this function's body changes rather than every caller.
 */
export function rightsOf(spot: HasAccess): SpotRights {
  return RIGHTS[spot.access];
}

/**
 * Whether this place belongs to somebody rather than to everybody.
 *
 * True only for property. A residential permit is emphatically not ownership,
 * and the whole point of separating the two is that this function used to
 * return true for both under the name `isPrivate`.
 */
export function isOwnedProperty(spot: HasAccess): boolean {
  return spot.access === "private_property";
}

/**
 * Whether money may lawfully be asked for this place.
 *
 * The single check every paid flow must pass, and the reason this module
 * exists. Read the header before relaxing it: on a public facility or a
 * permit space the answer is not "not yet", it is an offence.
 */
export function mayBeSharedForMoney(
  spot: HasAccess,
): boolean {
  return rightsOf(spot).paidSharingAllowed;
}

/**
 * Whether a listing of this place needs its lister's right proved first.
 *
 * True of everything anybody may list. A public facility is the only kind
 * nobody lists -- it arrives from a registry -- so it is the only kind with
 * nothing to verify.
 */
export function needsRightVerified(
  spot: HasAccess,
): boolean {
  return rightsOf(spot).verificationRequired;
}

/**
 * Whether a free-space count for this place would be a fact rather than a
 * guess.
 *
 * Asked before drawing a number. Everything the app knows about a public car
 * park comes from a registry that records how many bays exist, never how many
 * are free.
 */
export function hasExactCount(spot: HasAccess): boolean {
  return rightsOf(spot).exactCount;
}

/**
 * What the app used to store, mapped onto what it means now.
 *
 * `0001` allowed two values and `0010` widened them to three, but a row
 * written before that migration -- or by a client that has not been updated --
 * still says `public` or `private`. Both have exact readings: `private` meant
 * property, because it was the only thing an owner could declare windows on,
 * and `public` meant everything else, permit spaces included, because there
 * was nowhere else to put them.
 *
 * The permit spaces are the loss, and it is not recoverable here: nothing in
 * the old row said which public spaces were allocated to residents. They read
 * as public facilities, which is the safe direction -- a permit space
 * mistaken for public loses its holder a listing they cannot make yet, where
 * a public space mistaken for a permit would invite one nobody may make.
 */
export function toSpotAccess(stored: string | null | undefined): SpotAccess {
  switch (stored) {
    case "private":
    case "private_property":
      return "private_property";
    case "residential_permit":
      return "residential_permit";
    /* Including null. A row that does not say is a public kerb, which is what
       `toParkingSpot` has always assumed and the only reading that cannot
       hand somebody a right they were not given. */
    default:
      return "public_facility";
  }
}
