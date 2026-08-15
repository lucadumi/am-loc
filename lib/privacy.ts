/**
 * What the app holds about a person, for how long, and what leaving does to it.
 *
 * The client half of `0012_privacy_lifecycle.sql`. Like `lib/roles.ts` against
 * `has_role`, this is a deliberate copy rather than a shared source: the
 * register in the database is what *is*, enforced by triggers and delete
 * rules; this is what the app *says*, and the two being separate is what makes
 * it possible to notice when a screen has started promising something the
 * schema stopped doing. `data_inventory` is the authority; if these disagree,
 * this file is wrong.
 *
 * ---
 *
 * WHY EVERY CATEGORY CARRIES A FATE. The interesting half of a privacy screen
 * is not the deleting, it is the not-deleting. An app that lists what it
 * erases and stays quiet about the rest has told the truth and left the wrong
 * impression, and the person finds out what survived at the worst possible
 * moment -- when they see it, after they were told it was gone.
 *
 * So `fate` is a closed union over three outcomes and every category has to
 * pick one. `severed` is the one that would otherwise go unsaid: the row
 * stays, the name comes off, and that is neither deletion nor retention.
 *
 * Pure, with no runtime imports beyond a sibling, so `node --test` loads it.
 */

import { plural } from "./bucharest-time.ts";

/**
 * What happens to a category when somebody asks to be forgotten.
 *
 * Not a boolean, because "kept" and "severed" are the two answers a boolean
 * would collapse, and they are the two a person actually needs to tell apart.
 */
export type ErasureFate =
  /** The rows go. */
  | "deleted"
  /** The rows stay; the person's name comes off them. */
  | "severed"
  /** The rows stay as they are, and something has to justify that. */
  | "kept";

export interface DataCategory {
  key: string;
  /** What it is, in the words of the person it is about. */
  what: string;
  /** How long it is held, and on what clock. */
  kept: string;
  fate: ErasureFate;
  /** What erasure does to it, said plainly enough to be checked afterwards. */
  onErasure: string;
}

/**
 * Every kind of personal data this app holds, in the order a person cares.
 *
 * Their own complaints first -- that is what they came to the screen about --
 * and the two categories that survive them last, where they read as the
 * exceptions they are rather than as small print above the button.
 */
export const DATA_CATEGORIES: readonly DataCategory[] = [
  {
    key: "reports",
    what: "Sesizările tale: locul, ora, ce ai scris și pozele.",
    kept: "Numărul de înmatriculare și pozele se șterg automat după 12 luni. Sesizarea rămâne și după.",
    fate: "deleted",
    onErasure: "Se șterg complet, cu poze cu tot.",
  },
  {
    key: "profile",
    what: "Contul: numele afișat și dacă ai spus că ești firmă.",
    kept: "Cât timp ai contul.",
    fate: "deleted",
    onErasure: "Se șterge.",
  },
  {
    key: "windows",
    what: "Intervalele în care ți-ai oferit locul.",
    kept: "Până le retragi.",
    fate: "deleted",
    onErasure: "Se șterg.",
  },
  {
    key: "private_spots",
    what: "Locurile care sunt proprietatea ta, ca un garaj.",
    kept: "Cât timp le ții listate.",
    fate: "deleted",
    onErasure: "Se șterg de pe hartă.",
  },
  {
    key: "public_spots",
    what: "Locurile publice pe care le-ai adăugat pe hartă.",
    kept: "Cât timp există locul.",
    fate: "severed",
    onErasure: "Rămân pe hartă, fără numele tău. Locul e al străzii, nu al tău.",
  },
  {
    key: "actions",
    what: "Ce ai făcut la sesizările altora: trimis mai departe, marcat eliberat.",
    kept: "Cât timp există sesizarea la care ai lucrat.",
    fate: "severed",
    onErasure: "Rămân, fără numele tău.",
  },
  {
    key: "evidence_access",
    what: "Cine ți-a deschis pozele și pe ce temei.",
    kept: "24 de luni.",
    fate: "deleted",
    onErasure: "Se șterge odată cu sesizarea la care se referă.",
  },
  {
    key: "official_resolutions",
    what: "Că o primărie de sector a închis o sesizare de-a ta.",
    kept: "Nelimitat, dar fără nicio legătură cu tine după ce pleci.",
    fate: "kept",
    onErasure:
      "Rămâne doar atât: ce fel de problemă, în ce sector, la ce dată și ce instituție a rezolvat-o. Nu și că era a ta.",
  },
  {
    key: "erasure_requests",
    what: "Că ai cerut ștergerea și când a fost făcută.",
    kept: "3 ani.",
    fate: "kept",
    onErasure: "Rămâne. E singura dovadă că cererea ta a fost respectată.",
  },
];

/** The categories that go, for a confirmation that has to be specific. */
export function whatErasureRemoves(): DataCategory[] {
  return DATA_CATEGORIES.filter((c) => c.fate === "deleted");
}

/**
 * The categories that outlive the account.
 *
 * The half of the dialog worth reading. Both `severed` and `kept`, because
 * from where the person is standing "it stays without your name" and "it
 * stays" are both answers to "will this be gone", and both are no.
 */
export function whatErasureKeeps(): DataCategory[] {
  return DATA_CATEGORIES.filter((c) => c.fate !== "deleted");
}

/** What `erase_me()` hands back. Mirrors the jsonb the function builds. */
export interface ErasureReceipt {
  reports_deleted: number;
  availability_windows_deleted: number;
  private_spots_deleted: number;
  actions_kept_unattributed: number;
  storage_prefix: string;
  login_and_photos_pending: boolean;
}

/**
 * The receipt, in sentences.
 *
 * Counts rather than "gata": a person who has just deleted three years of
 * their own complaints is owed the number, and a screen that says only
 * "success" is indistinguishable from one that did nothing.
 *
 * Zeroes are dropped. "0 sesizări șterse" is noise on the way to the line that
 * matters, and the last line always survives the filter.
 */
export function receiptLines(receipt: ErasureReceipt): string[] {
  const lines: string[] = [];

  if (receipt.reports_deleted > 0) {
    lines.push(
      `${receipt.reports_deleted} ${plural(receipt.reports_deleted, "sesizare ștearsă", "sesizări șterse")}.`,
    );
  }
  if (receipt.private_spots_deleted > 0) {
    lines.push(
      `${receipt.private_spots_deleted} ${plural(receipt.private_spots_deleted, "loc șters", "locuri șterse")}.`,
    );
  }
  if (receipt.availability_windows_deleted > 0) {
    lines.push(
      `${receipt.availability_windows_deleted} ${plural(receipt.availability_windows_deleted, "interval șters", "intervale șterse")}.`,
    );
  }
  if (receipt.actions_kept_unattributed > 0) {
    lines.push(
      `${receipt.actions_kept_unattributed} ${plural(receipt.actions_kept_unattributed, "acțiune rămâne", "acțiuni rămân")} la sesizările altora, fără numele tău.`,
    );
  }

  // Always last, and always said. The account is not gone at the moment this
  // is read -- the photographs and the autentificare are removed by a job --
  // and letting the screen imply otherwise is the one lie available here.
  if (receipt.login_and_photos_pending) {
    lines.push("Pozele și autentificarea se șterg în cel mult 30 de zile.");
  }

  return lines;
}

/** What `export_my_data()` returns. Only the parts the screen counts. */
export interface DataExport {
  exported_at: string;
  account: { id: string };
  profile: unknown | null;
  roles: unknown[];
  reports: unknown[];
  actions_on_reports: unknown[];
  spots: unknown[];
  availability_windows: unknown[];
  who_opened_my_evidence: unknown[];
  erasure_requests: unknown[];
}

export interface ExportLine {
  label: string;
  count: number;
}

/**
 * What was in the export, so the person can tell it worked.
 *
 * A downloaded file is not feedback. The counts are, and one of them is the
 * point of the whole screen: `who_opened_my_evidence` is how somebody finds
 * out a warden opened their photographs, which is the disclosure they would
 * otherwise never learn about.
 */
export function summariseExport(dump: DataExport): ExportLine[] {
  const lines: ExportLine[] = [
    { label: "sesizări", count: dump.reports?.length ?? 0 },
    { label: "locuri", count: dump.spots?.length ?? 0 },
    { label: "intervale", count: dump.availability_windows?.length ?? 0 },
    {
      label: "acțiuni la sesizările altora",
      count: dump.actions_on_reports?.length ?? 0,
    },
    {
      label: "deschideri ale pozelor tale",
      count: dump.who_opened_my_evidence?.length ?? 0,
    },
  ];

  return lines.filter((line) => line.count > 0);
}

/** One summary line, with the noun agreeing with the number. */
export function exportLineLabel(line: ExportLine): string {
  const nouns: Record<string, [string, string]> = {
    sesizări: ["sesizare", "sesizări"],
    locuri: ["loc", "locuri"],
    intervale: ["interval", "intervale"],
    "acțiuni la sesizările altora": [
      "acțiune la sesizările altora",
      "acțiuni la sesizările altora",
    ],
    "deschideri ale pozelor tale": [
      "deschidere a pozelor tale",
      "deschideri ale pozelor tale",
    ],
  };

  const [one, many] = nouns[line.label] ?? [line.label, line.label];
  return `${line.count} ${plural(line.count, one, many)}`;
}

/**
 * What the file is called.
 *
 * Dated, because a person exercising this right more than once ends up with
 * two files in the same folder and needs to know which is which. Local date
 * rather than the ISO instant: the name is read by a human, in Bucharest.
 */
export function exportFileName(at: Date = new Date()): string {
  const year = at.getFullYear();
  const month = String(at.getMonth() + 1).padStart(2, "0");
  const day = String(at.getDate()).padStart(2, "0");
  return `am-loc-datele-mele-${year}-${month}-${day}.json`;
}

/**
 * The export as text.
 *
 * Indented, and that is not decoration. Article 20 asks for a "commonly used"
 * and "machine-readable" format, and the same document has to be legible to
 * the person who asked for it -- who will open it on a telephone, in whatever
 * will render a .json, and should not meet one line forty thousand characters
 * long.
 */
export function exportToText(dump: DataExport): string {
  return JSON.stringify(dump, null, 2);
}
