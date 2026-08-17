/**
 * What this app has to tell somebody before it takes anything from them.
 *
 * Article 13, which is the one obligation in this project that no amount of
 * schema can discharge. `0012` made every table answer for itself, `0013` made
 * the retention periods run, and both of those are the project talking to
 * itself: a register in a database and a document in a repository are read by
 * whoever maintains the promise, never by the person it is made to. This is
 * the promise said out loud, in the app, in Romanian, before somebody files
 * their first complaint.
 *
 * ---
 *
 * WHY IT IS DATA AND NOT A SCREEN FULL OF PARAGRAPHS. Article 13 is a list of
 * things that must be said -- who is holding this, why, on what basis, who
 * else sees it, how long, what you may demand, and where to complain if the
 * answer is unsatisfactory -- and a wall of prose is the easiest place in the
 * world to lose one of them. Written as data, the omissions are checkable:
 * `noticeGaps()` returns what a reader would still not know, and the test
 * suite fails on any purpose without a basis and any category of data that
 * `lib/privacy.ts` knows about and this file does not.
 *
 * That last check is the one worth having. A future migration adds a table,
 * `unregistered_tables()` makes somebody give it a retention rule, and this
 * makes them say it to the person as well.
 *
 * WHY THE CONTROLLER IS EMPTY, AND WHY THAT IS BETTER THAN A NAME. Art. 13(1)(a)
 * wants an identity and a contact, and inventing either would be worse than
 * the gap: a notice naming an address nobody reads is a way of appearing to
 * accept requests while receiving none. So it is blank, `controllerIsNamed()`
 * is false, and the screen says so where the name would have been. This build
 * is honest about being pre-launch; filling it in is a two-line change and the
 * DPIA's conclusion turns on it.
 *
 * WHAT IS DELIBERATELY NOT CLAIMED. No consent is asked for anywhere here,
 * because none is relied on: every basis below is contract or legitimate
 * interests, and a "consimțământ" checkbox on top of processing that would
 * happen anyway is theatre. There is no automated decision-making, no
 * profiling and no third-country transfer to declare, and each of those is
 * stated rather than left out -- an absence a reader has to infer is an
 * absence they cannot rely on.
 *
 * Pure, so `node --test` reads it.
 */

/** Article 6, in the two forms this project actually relies on. */
export type LawfulBasis = "contract" | "legitimate_interests" | "legal_obligation";

/** The basis, as somebody who has not read the Regulation would meet it. */
export function basisLabel(basis: LawfulBasis): string {
  switch (basis) {
    case "contract":
      return "ca să funcționeze aplicația pe care ai cerut-o (art. 6 alin. 1 lit. b)";
    case "legitimate_interests":
      return "interesul legitim al aplicației (art. 6 alin. 1 lit. f)";
    case "legal_obligation":
      return "o obligație legală (art. 6 alin. 1 lit. c)";
  }
}

export interface Purpose {
  key: string;
  /** What is taken, in the words of the person it is taken from. */
  what: string;
  /** What it is for. One sentence, no hedging. */
  why: string;
  basis: LawfulBasis;
  /**
   * The interest being balanced, where the basis is legitimate interests.
   *
   * Art. 13(1)(d) asks for it by name, and it is the field that stops that
   * basis being the box everything unclassifiable gets put in: an interest you
   * have to write down is one somebody can disagree with.
   */
  interest?: string;
  /** The categories in lib/privacy.ts this purpose accounts for. */
  categories: readonly string[];
}

/**
 * Why this app holds anything at all, in the order somebody meets it.
 *
 * Parking first, because that is what the app is for and what a person opens
 * it to do. The complaint second, which is the part with somebody else's
 * registration number in it. The account last -- it exists to serve the two
 * above rather than the other way round, and putting it first would be the
 * ordering of a company describing its users rather than of an app describing
 * itself.
 */
export const PURPOSES: readonly Purpose[] = [
  {
    key: "parking",
    what: "Unde ai spus că ai parcat și când.",
    why: "Ca să-ți găsești mașina și să-ți vezi propriul istoric.",
    basis: "contract",
    interest: undefined,
    categories: ["parkings"],
  },
  {
    key: "spots",
    what: "Locurile pe care le adaugi pe hartă și, dacă ai un loc privat, intervalele în care îl oferi.",
    why: "Ca ceilalți șoferi să știe unde există locuri de parcare.",
    basis: "legitimate_interests",
    interest:
      "O hartă a parcărilor din București e utilă tuturor celor care caută un loc.",
    categories: ["public_spots", "private_spots", "windows"],
  },
  {
    key: "reports",
    what: "Sesizările tale: locul, ora, ce ai scris, pozele și numărul de înmatriculare al mașinii din poză.",
    why: "Ca sesizarea să ajungă la primăria de sector care poate rezolva problema.",
    basis: "legitimate_interests",
    interest:
      "Un trotuar, o rampă sau o trecere blocată e o problemă a tuturor, iar cine o poate rezolva are nevoie să vadă unde, când și ce.",
    categories: ["reports", "actions", "official_resolutions"],
  },
  {
    key: "account",
    what: "Contul: numele afișat, adresa de e-mail dacă ți-ai făcut cont, și dacă ai spus că ești firmă.",
    why: "Ca sesizările și locurile tale să fie ale tale și să le poți gestiona de pe orice telefon.",
    basis: "contract",
    interest: undefined,
    categories: ["profile"],
  },
  {
    key: "accountability",
    what: "Cine ți-a deschis pozele, în ce calitate și când. Și faptul că ai cerut ștergerea, dacă o ceri.",
    why: "Ca accesul la pozele tale să poată fi verificat, și ca ștergerea să poată fi dovedită.",
    basis: "legal_obligation",
    interest: undefined,
    categories: ["evidence_access", "erasure_requests"],
  },
];

export interface Recipient {
  who: string;
  what: string;
}

/**
 * Who else sees any of this. Art. 13(1)(e).
 *
 * Three, and the list is short because the answer is short: nothing here is
 * sold, nothing is shared for advertising, and there is no analytics service.
 * Saying that plainly is worth more than the list itself, which is why
 * `NOBODY_ELSE` exists below rather than being left as an inference.
 */
export const RECIPIENTS: readonly Recipient[] = [
  {
    who: "Primăria de sector care poate rezolva sesizarea",
    what: "Sesizarea, cu locul, ora, pozele și numărul de înmatriculare. Doar sectorul în care e problema, și doar conturi verificate ale instituției.",
  },
  {
    who: "Ceilalți utilizatori ai aplicației",
    what: "Sesizarea fără numărul de înmatriculare și fără poze, și locurile pe care le-ai adăugat pe hartă.",
  },
  {
    who: "Supabase, unde e găzduită baza de date",
    what: "Totul, ca furnizor de găzduire. Nu folosește datele în scopuri proprii.",
  },
];

/** Said out loud rather than left to be inferred from a short list. */
export const NOBODY_ELSE =
  "Nimeni altcineva. Datele tale nu se vând, nu se dau pentru publicitate și nu există niciun serviciu de analiză în aplicație.";

/** Art. 13(1)(f). Stated even though the answer is "none". */
export const TRANSFERS =
  "Datele stau în Uniunea Europeană și nu se transferă în afara ei.";

/** Art. 13(2)(f). Same reasoning: an absence has to be said to be relied on. */
export const AUTOMATED_DECISIONS =
  "Nicio decizie despre tine nu se ia automat. Nu există profilare și nimic din ce faci aici nu produce un scor.";

/**
 * Art. 13(2)(e): whether any of this is obliged, and what happens if not.
 *
 * Worth stating carefully in an app where most of it is genuinely optional.
 * Nothing here is a legal requirement and nothing is a condition of using the
 * map; what a person loses by withholding is the feature, not the app.
 */
export const IF_YOU_DO_NOT_GIVE_IT =
  "Nimic din toate acestea nu e obligatoriu prin lege. Poți folosi harta fără cont. Fără poziție nu-ți putem arăta ce e în apropiere, fără poze o sesizare are șanse mici să fie rezolvată, iar fără cont sesizările și locurile nu rămân ale tale.";

export interface Right {
  key: string;
  title: string;
  /** What it means here, not what the article says. */
  what: string;
  /** Where in this app it is exercised, or how to ask. */
  how: string;
}

/**
 * The rights, and where each one actually is.
 *
 * Art. 13(2)(b) asks for the list; a list without the route is the thing that
 * makes people write to a company and wait. Two of these are buttons one
 * screen away, and saying so is the difference between a notice and a form of
 * words.
 */
export const RIGHTS: readonly Right[] = [
  {
    key: "access",
    title: "Să vezi ce avem despre tine",
    what: "Tot ce ține aplicația despre tine, inclusiv numărul de înmatriculare și pozele pe care nici ceilalți utilizatori nu le văd.",
    how: "Contul meu → Datele mele → Descarcă datele mele",
  },
  {
    key: "portability",
    title: "Să le iei cu tine",
    what: "Aceleași date, într-un fișier pe care îl poți da mai departe.",
    how: "Același buton. Fișierul e al tău.",
  },
  {
    key: "rectification",
    title: "Să le corectezi",
    what: "Textul și numărul de înmatriculare dintr-o sesizare pot fi corectate. Locul, ora și autorul nu — o sesizare corectată acolo ar fi altă sesizare.",
    how: "Deschide sesizarea și modific-o.",
  },
  {
    key: "erasure",
    title: "Să le ștergi",
    what: "Contul și tot ce ai trimis. Două lucruri rămân și îți spunem care înainte să apeși: că o primărie a închis o sesizare, fără nicio legătură cu tine, și dovada că ai cerut ștergerea.",
    how: "Contul meu → Datele mele → Șterge contul",
  },
  {
    key: "restriction",
    title: "Să ne opui sau să ceri limitarea",
    what: "Te poți opune prelucrării făcute pe interes legitim — harta și sesizările — și poți cere ca datele să fie ținute fără să fie folosite, cât timp se lămurește o contestație.",
    how: "Scrie-ne la adresa de mai sus.",
  },
  {
    key: "complaint",
    title: "Să reclami, dacă nu-ți convine răspunsul",
    what: "Nu trebuie să treci prin noi mai întâi.",
    how: "ANSPDCP, autoritatea de supraveghere.",
  },
];

/** Art. 13(2)(d). Public information about a public body. */
export const SUPERVISORY_AUTHORITY = {
  name: "Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP)",
  address: "B-dul G-ral. Gheorghe Magheru 28-30, Sector 1, București",
  site: "www.dataprotection.ro",
} as const;

export interface Controller {
  /** Who is answerable. Empty until this app has one. */
  name: string;
  /** Where a request goes. Empty for the same reason. */
  contact: string;
}

/**
 * Who is answerable for all of the above.
 *
 * Empty, and the screen says so. See the note at the top of this file: a
 * contact address that nobody reads is worse than a blank, because it looks
 * like a way to reach somebody. Fill both in before this app is in anybody's
 * hands.
 */
export const CONTROLLER: Controller = {
  name: "",
  contact: "",
};

/** Whether there is somebody to write to. */
export function controllerIsNamed(): boolean {
  return CONTROLLER.name.trim() !== "" && CONTROLLER.contact.trim() !== "";
}

/**
 * What a reader would still not know after reading this.
 *
 * The screen draws it where the answer would have been, rather than at the
 * bottom in small letters. A notice with a hole in it that announces the hole
 * is a working document; one that does not is a misrepresentation, and this
 * function is what keeps the difference from depending on somebody remembering.
 */
export function noticeGaps(): string[] {
  const gaps: string[] = [];
  if (!controllerIsNamed()) {
    gaps.push(
      "Aplicația nu numește încă un operator și o adresă de contact. Până atunci, cererile de mai jos se pot face din aplicație, dar nu ai unde să ne scrii.",
    );
  }
  return gaps;
}

/**
 * Every category of personal data covered by some purpose above.
 *
 * The key to the check in the tests: `DATA_CATEGORIES` in lib/privacy.ts is
 * the client's copy of the register, and anything in it that no purpose here
 * accounts for is data this app holds and does not admit to holding.
 */
export function coveredCategories(): Set<string> {
  return new Set(PURPOSES.flatMap((purpose) => purpose.categories));
}
