/**
 * What leaving does to everything the app holds about a person.
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
 * WHY EVERY CATEGORY CARRIES A FATE. The interesting half of an erasure is not
 * the deleting, it is the not-deleting. An app that lists what it erases and
 * stays quiet about the rest has told the truth and left the wrong impression,
 * and the person finds out what survived at the worst possible moment -- when
 * they see it, after they were told it was gone.
 *
 * So `fate` is a closed union over three outcomes and every category has to
 * pick one. `severed` is the one that would otherwise go unsaid: the row
 * stays, the name comes off, and that is neither deletion nor retention.
 *
 * WHY THERE IS NO RETENTION PROSE HERE ANY MORE. There used to be, a sentence
 * per category about how long each table is kept, and "Datele mele" printed
 * all nine of them as a list. It was the schema talking to somebody who had
 * come to see their own things, and it has gone back to where it belongs --
 * `data_inventory` and docs/data-retention.md, which are read by the people
 * who maintain the promise rather than recited at the person it is made to.
 * What is left is the one thing that has to be said out loud at the moment it
 * matters, in the confirmation before an irreversible button.
 *
 * The other half of this module is the export: what came back and how to
 * count it, including the log of who opened somebody's photographs -- which
 * the screen no longer draws and the document still carries.
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
  fate: ErasureFate;
  /**
   * What erasure does to it, said plainly enough to be checked afterwards.
   *
   * A whole sentence, naming its own subject. These are read as bullets in a
   * dialog with nothing above them to lean on, and "Rămân, fără numele tău" is
   * not an answer to anything if the reader has to guess what "they" are.
   */
  onErasure: string;
}

/**
 * Every kind of personal data this app holds, in the order a person cares.
 *
 * Their own complaints first -- that is what they came for -- and the two
 * categories that survive them last, where they read as the exceptions they
 * are rather than as small print above the button.
 */
export const DATA_CATEGORIES: readonly DataCategory[] = [
  {
    key: "reports",
    fate: "deleted",
    onErasure: "Sesizările tale se șterg, cu poze cu tot.",
  },
  {
    key: "profile",
    fate: "deleted",
    onErasure: "Contul și numele tău se șterg.",
  },
  {
    key: "windows",
    fate: "deleted",
    onErasure: "Intervalele pe care le-ai oferit se șterg.",
  },
  {
    key: "private_spots",
    fate: "deleted",
    onErasure: "Locurile tale private dispar de pe hartă.",
  },
  {
    key: "parkings",
    fate: "deleted",
    onErasure: "Istoricul parcărilor tale se șterge.",
  },
  {
    key: "public_spots",
    fate: "severed",
    onErasure:
      "Locurile publice adăugate de tine rămân pe hartă, fără numele tău.",
  },
  {
    key: "actions",
    fate: "severed",
    onErasure: "Ce ai făcut la sesizările altora rămâne, fără numele tău.",
  },
  {
    key: "evidence_access",
    fate: "deleted",
    onErasure: "Lista cu cine ți-a deschis pozele se șterge cu sesizarea.",
  },
  {
    key: "official_resolutions",
    fate: "kept",
    onErasure:
      "Sesizările închise de o primărie rămân la ea, fără nicio legătură cu tine.",
  },
  {
    key: "erasure_requests",
    fate: "kept",
    onErasure:
      "Rămâne dovada că ai cerut ștergerea și că s-a făcut.",
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
  parkings_deleted: number;
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
  // Before the spots and the windows, because it is the line worth reading:
  // a log of where somebody parks is the most sensitive thing this app keeps.
  if (receipt.parkings_deleted > 0) {
    lines.push(
      `${receipt.parkings_deleted} ${plural(receipt.parkings_deleted, "parcare ștearsă", "parcări șterse")}.`,
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

/** What `export_my_data()` returns. Only the parts the screen reads. */
export interface DataExport {
  exported_at: string;
  account: { id: string };
  profile: unknown | null;
  roles: unknown[];
  reports: unknown[];
  actions_on_reports: unknown[];
  spots: unknown[];
  availability_windows: unknown[];
  parkings: unknown[];
  who_opened_my_evidence: EvidenceLook[];
  erasure_requests: unknown[];
}

/**
 * One time somebody who did not file a report opened its photographs.
 *
 * The shape `export_my_data()` builds out of `evidence_access`, and notably
 * not the whole row: the export hands back the role it was done under and the
 * moment, never `looked_by`. A driver is owed the disclosure; naming the
 * individual warden would turn an accountability log into a way of finding out
 * which person at the sector hall to be angry at.
 */
export interface EvidenceLook {
  report_id: string;
  as_role: string;
  looked_at: string;
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
    { label: "parcări", count: dump.parkings?.length ?? 0 },
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
    parcări: ["parcare", "parcări"],
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
