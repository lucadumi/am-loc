# Retention

What this project holds about people, how long, and what removes it.

The authority is the `data_inventory` table in the database, seeded by
`0012_privacy_lifecycle.sql`. This file explains it; the table enforces it, and
`unregistered_tables()` fails when a migration adds a table without answering
the four questions. If this document and the table disagree, the table is
right and this document is out of date.

## The register

| Table | Whose | Kept | Erasure |
|---|---|---|---|
| `spots` | Owners and contributors | While the place exists | Private property deleted; everything else severed |
| `availability_windows` | Owners of private spots | Until withdrawn | Deleted |
| `reports` | The reporter, and the driver photographed | Complaint kept; plate and photographs cleared at 12 months | Deleted in full |
| `report_events` | Whoever acted | With its report | Actor severed, act survives |
| `profiles` | Every account holder | Life of the account | Deleted |
| `user_roles` | Holders of a grant | While the grant stands | Deleted |
| `evidence_access` | The looker, and the reporter | 24 months | Exempt while retained |
| `organisations` | Nobody | Indefinite | Not deleted |
| `official_resolutions` | Nobody, once severed | Indefinite | Kept, de-identified |
| `erasure_requests` | People who asked | 3 years | Kept, deliberately |
| `data_inventory` | Nobody | Indefinite | Not deleted |

## The two that survive an erasure

Everything a person filed is deleted when they ask. Two things are not, and
both are listed to them on the privacy screen before they press the button.

**`official_resolutions`** records that a sector hall closed a case: the
category, the sector, the two dates and which office acted. It never held the
reporter, the plate, the photographs, the address or the coordinates, and its
link to the report is cut when the report goes. A public body's record of its
own work should not be destroyable months later by a private individual
closing an unrelated account.

**`erasure_requests`** records that somebody asked and when each half was
carried out. It has no foreign key to `auth.users` on purpose: honouring a
request must not destroy the evidence that it was honoured, which is what
Article 12(3) asks the project to be able to show.

## Erasure has three halves and Postgres owns one

`erase_me()` deletes the rows and writes down what it could not reach. The rest
needs the service key:

1. Read `pending_erasures()`.
2. Delete everything under `storage_prefix` through the storage API.
3. Delete the `auth.users` row through the admin API.
4. Call `finish_erasure(user_id)`.

In that order. A crash between 2 and 3 leaves an account with no photographs,
which is recoverable; the other order loses the pointer to the bytes and leaves
them forever. This is the same shape as the evidence retention pair in
`0009_evidence_is_private.sql`, for the same reason.

**Nothing runs this yet.** The functions exist and are tested; no schedule
calls them. Until one does, the retention periods in the table above are
policy, not fact — and that is the honest state of it rather than a gap
somebody forgot to mention.

## Scheduling what can be scheduled

Two of the retention rules are pure SQL and can run inside the database. If
`pg_cron` is enabled on the project:

```sql
select cron.schedule(
  'forget-old-plates', '0 3 * * *',
  $$select public.forget_report_plates()$$
);
select cron.schedule(
  'expire-evidence-log', '30 3 * * *',
  $$select public.forget_old_evidence_access()$$
);
```

The photographs cannot be done this way. `evidence_past_retention()` says what
is due, the storage API deletes the files, and `forget_evidence()` clears the
paths afterwards — and the middle step is an HTTP call, so it needs a job
outside Postgres holding the service key. The same is true of the second half
of an erasure.

## Data subject requests

- **Access and portability (Art. 15, 20)** — `export_my_data()`, reachable from
  *Contul meu → Datele mele → Descarcă datele mele*. It returns the caller's
  own plate and photo paths, which `reports_readable` hides from everybody
  including them, and the log of who opened their evidence.
- **Erasure (Art. 17)** — `erase_me()`, from the same screen.
- **Rectification (Art. 16)** — a report's text and plate are editable by its
  author; its place, moment and author are not, by trigger.

**Identifying the requester is unsolved for anonymous accounts.** Most accounts
here are anonymous: `signInAnonymously` has been minting them since `0001`, and
whoever holds the telephone is that account. Both requests above are keyed on
`auth.uid()`, so they are answered to whoever holds the session and to nobody
else. Somebody who loses the device cannot exercise either right, and there is
no mechanism that could give it to them without also giving it to a stranger
claiming to be them. See the DPIA.
