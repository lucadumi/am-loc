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
| `parkings` | The driver who parked | Until they delete it | Deleted |
| `evidence_access` | The looker, and the reporter | 24 months | Exempt while retained |
| `organisations` | Nobody | Indefinite | Not deleted |
| `official_resolutions` | Nobody, once severed | Indefinite | Kept, de-identified |
| `erasure_requests` | People who asked | 3 years | Kept, deliberately |
| `data_inventory` | Nobody | Indefinite | Not deleted |

## The two that survive an erasure

Everything a person filed is deleted when they ask. Two things are not, and
both are listed to them in the confirmation dialog before they press the
button — `whatErasureKeeps()` in `lib/privacy.ts` is what that dialog reads.

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

1. Read `pending_erasures()`, which holds a request back for three hours — long
   enough that nothing authorised before it was made can still be arriving.
2. Run `forget_everything(user_id)` again, for anything written in the window
   before the request became visible to the write policies — `0014`.
3. Delete everything under `storage_prefix` through the storage API.
4. Delete the `auth.users` row through the admin API.
5. Call `finish_erasure(user_id)`.

And then, on the nights afterwards, sweep that prefix again until three of them
in a row turn up nothing: `finished_erasures()` names the closed requests still
being watched. Three hours outlives an authorisation given before the request;
it does not bound one, because a storage request is authorised when it starts
and not when its body finishes. Nothing can refuse a file that lands after the
request was closed — there is no row left to check and no login to disable — so
the job goes back and looks. What it finds is counted as `photos_after_the_end`
rather than added to the night's total, because it means somebody was told
their photographs were gone while one of them was still on its way, and finding
one starts the three nights again.

Nights, counted on the row, rather than a week on the calendar. A window of
time is only a window if the job runs: an outage longer than it would let every
erasure closed beforehand fall out of the list having never been looked at, and
nothing would say so. A count cannot age out — an outage delays the watch and
does not end it — and it is also what makes the list safe to read unpaged, since
a night that returns short leaves the rest with their counts intact for the next
one.

What the count does not do is prove that nothing is still on its way. Three
quiet nights are three nights of evidence, not a guarantee that no request is
open, and an upload authorised before the erasure and still streaming days later
would land after the last look. No interval closes that and no count does
either; it needs a check at the moment the object is written, which Supabase
does not offer. It is in `docs/dpia.md` under what is not done, which is the
honest place for a measure that cannot be finished.

In that order. A crash between 3 and 4 leaves an account with no photographs,
which is recoverable; the other order loses the pointer to the bytes and leaves
them forever. This is the same shape as the evidence retention pair in
`0009_evidence_is_private.sql`, for the same reason. Step 2 comes before 4 for
a different reason: a `private_property` spot that outlives `erase_me` makes the
`auth.users` delete violate the check constraint in `0010`, and an erasure that
fails at step 4 fails there every night.

**`0013_retention_jobs.sql` runs this.** The functions had existed and been
tested for a while with nothing calling them, which made every retention period
in the table above a policy rather than a fact. Four cron jobs and one Deno
function later, they are facts — as far as anything asserted by a schedule
nobody has watched run in production can be.

Scheduling it also closed three holes that had cost nothing while nothing ran,
and all three are in `0013`: `reports.photos` accepted any string, so a driver
could name somebody else's photograph and have the nightly job delete it;
`created_at` was insertable, so a report could arrive already older than its
own retention period, or dated to outlive it; and the bucket accepted uploads
from an account whose erasure was halfway done.

**`0014_erasure_is_final.sql` finishes that last one.** Closing the bucket left
the tables open, and the gap is the same gap: the rows go the moment somebody
presses the button, the photographs and the login go on the next run of the
job, and the tokens outlive both — signing out asks for the refresh tokens to
be revoked, and `abandonErasedSession` does not wait to hear whether the ask
worked, while an access token already issued is a signed statement with an
expiry on it that nothing can call back, good for up to an hour on any
telephone that was signed in. Most tables here cascade off `auth.users`, so what
was written in the gap goes when the login goes; `spots` does not — `owner_id`
and `created_by` are `on delete set null`, and `owner_name` is plain text that
no cascade touches. Rather than
sort the schema into the tables that cascade and the tables that do not — a
sorting one new table away from being wrong — every write policy now asks
`being_erased()` first, and the answer is read as the definer so that narrowing
the view of `erasure_requests` cannot make the barrier pass by accident.
Reading and deleting are untouched: both go the way the erasure is already
going.

A barrier can only refuse a write it can see, though, and `erase_me()` writes
the request and deletes the rows in one transaction: a statement that began
before that transaction committed reads a snapshot with no request in it, is
allowed through, and commits after the deletions have run past it. So the same
migration does it twice. `erase_me()` keeps its transaction and its receipt, and
what it deletes now lives in `forget_everything(uuid)` — one definition of what
an erasure removes, with two callers, because the job runs it again once the
request is three hours old — `pending_erasures()` holds it back that long, and
the figure is Supabase's two-hour upload token plus an hour, since an upload is
authorised when it starts and a signed URL when it is minted, and neither can be
called back by a policy. By then anything that raced the request has long since
committed and is plainly visible. The repeat is also what makes deleting the
login possible at all: `0010` requires a `private_property` spot to have an
owner and `spots.owner_id` is `on delete set null`, so a private spot that
outlived `erase_me` would make the `auth.users` delete violate the constraint —
and an erasure that fails there fails there every night, quietly, for good.

Moving the body also turned up a name that never went. `erase_me()` cleared
`owner_name` where `owner_id = me`, and `0010` requires a `public_facility` to
have no owner — so the only spots that rule could reach were the private ones
the line above it had already deleted, and a kerb somebody added with their name
on it kept the name, publicly, after `created_by` was severed and there was no
longer any way to find it. `forget_everything` now clears the name on a spot
somebody owns, and on an ownerless one they added. Only ownerless: `created_by`
is the only handle on a kerb and it was editable by whoever owned the row —
`created_by = created_by` in `0001` is `x = x` and never pinned anything — so
reading it wider than that would let one person aim another person's erasure at
their rows. A trigger in `0014` now refuses to repoint an author, and allows
only the severing of one.

`__tests__/erasure-is-final.test.ts` replays the migrations and fails if any
policy that can write is missing the barrier, if the deletions grow a second
definition, or if the job stops running them before it deletes the login.

## What runs, and when

| Job | When | What it is |
| --- | --- | --- |
| `forget-old-plates` | 03:00 daily | `forget_report_plates()`, in Postgres |
| `expire-evidence-log` | 03:30 daily | `forget_old_evidence_access()`, in Postgres |
| `expire-erasure-proof` | 03:45 daily | `forget_old_erasure_requests()`, in Postgres |
| `retention-worker` | 04:00 daily | `net.http_post` to the `retention` function |

The first three are pure SQL and run inside the database on `pg_cron`, which is
the whole of what they need.

The photographs cannot be done that way. `evidence_past_retention()` says what
is due, the storage API deletes the files, and `forget_evidence_paths()` clears
exactly those paths afterwards — and the middle step is an HTTP call with the
service key on it, as is the `auth.users` delete that finishes an erasure. So
the fourth job is `supabase/functions/retention`, a Deno function on Supabase's
own machines, where the key is an injected environment variable rather than a
secret copied into somebody else's CI.

`supabase/functions/_shared/retention.ts` holds the half of it that decides
things, so `node --test` covers the rules that would otherwise be checked only
by a night that went wrong:

- The expired list is read a page at a time, and each page is deleted and
  cleared before the next is asked for. Clearing is **by path**, not by report:
  a page boundary or a concurrent edit must not be able to blank a name whose
  file is still in the bucket. That is why `0013` adds
  `forget_evidence_paths()` beside `0009`'s `forget_evidence()`.
- A login is deleted only when a **fresh listing** of its prefix comes back
  empty — not when the deletes returned no error. A file uploaded during the
  sweep would not be in the first answer, and a listing that failed counts as
  "something is there".

### Setting it up on a project

The cron job reads the URL and the key out of Vault at the moment it runs, so
neither is in this repository. Once per project:

```sql
select vault.create_secret('https://<ref>.supabase.co', 'project_url');
select vault.create_secret('<the service role key>', 'service_role_key');
```

It has to be the `service_role` key itself — the one the platform injects into
the function as `SUPABASE_SERVICE_ROLE_KEY`, which the function compares what
arrives against. A project that has moved to the newer `sb_secret_…` keys needs
`verify_jwt` turned off for this function and that comparison pointed at
whichever secret it does send.

```bash
supabase functions deploy retention --project-ref <ref>
```

Until the secrets exist the http job selects no rows and makes no call — no
error, no half-authenticated request. The three SQL jobs run regardless.

To see whether any of it happened:

```sql
select jobid, jobname, schedule, active from cron.job;
select jobname, status, return_message, start_time
  from cron.job_run_details order by start_time desc limit 20;
```

and the function's log for the third, which prints what it removed and, more
usefully, what it could not.

## Data subject requests

- **Access and portability (Art. 15, 20)** — `export_my_data()`, reachable from
  *Contul meu → Datele mele → Descarcă datele mele*. It returns the caller's
  own plate and photo paths, which `reports_readable` hides from everybody
  including them, and the log of who opened their evidence. The export is the
  only route a subject has to that log: `evidence_access` is readable by admins
  alone, and "Datele mele" deliberately does not draw it — a screen of your own
  things is the wrong place to read about somebody else's conduct.
- **Erasure (Art. 17)** — `erase_me()`, from the same screen.
- **Rectification (Art. 16)** — a report's text and plate are editable by its
  author; its place, moment and author are not, by trigger.
- **Information (Art. 13)** — *Contul meu → Cum îți folosim datele*, built from
  `lib/privacy-notice.ts`. Purposes, bases, recipients, retention, rights and
  the supervisory authority. A test asserts that every category in
  `DATA_CATEGORIES` is explained by some purpose there, so a table added to the
  register cannot stay unmentioned to the person it is about. The controller
  and contact are deliberately blank until this app has one, and the screen
  says so rather than implying otherwise.

**Identifying the requester is unsolved for anonymous accounts.** Most accounts
here are anonymous: `signInAnonymously` has been minting them since `0001`, and
whoever holds the telephone is that account. Both requests above are keyed on
`auth.uid()`, so they are answered to whoever holds the session and to nobody
else. Somebody who loses the device cannot exercise either right, and there is
no mechanism that could give it to them without also giving it to a stranger
claiming to be them. See the DPIA.
