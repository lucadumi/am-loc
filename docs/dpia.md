# Data protection impact assessment

**Subject:** AmLoc, a parking app for Bucharest that lets drivers find spaces
and report blocked pavements, ramps, crossings and cycle lanes.

**Written by:** the project author. There is no DPO and this has not been
reviewed by a lawyer. It is a working document, not a certificate.

**Why one is needed.** Article 35(3)(b) and (c): the processing involves
photographs of identifiable people and their vehicles taken in public, on a
systematic basis, including data about alleged unlawful conduct (Article 10 is
not engaged — this is not a criminal conviction register — but the assessment
below treats it with the same seriousness). The people photographed are not
users and have no relationship with the project.

---

## 1. What is processed, and why

The register lives in the `data_inventory` table and is summarised in
[`data-retention.md`](./data-retention.md). In outline:

| Purpose | Data | Lawful basis |
|---|---|---|
| Show where parking exists | Places, owners of private spots | Art. 6(1)(f), and 6(1)(b) for an owner's own listing |
| Let a driver complain about a blockage | Location, time, photographs, registration number, free text | Art. 6(1)(f) |
| Let an institution act on the complaint | The above, disclosed to the sector with jurisdiction | Art. 6(1)(f); Art. 6(1)(e) for the recipient |
| Hold disclosures to account | Who opened whose evidence, and when | Art. 6(1)(c) with Art. 32 |
| Run accounts | Display name, trader declaration, roles | Art. 6(1)(b) and (f) |
| Help a driver find their own car again | Where they said they parked, and when | Art. 6(1)(b) |
| Show erasure was honoured | That somebody asked, and when | Art. 6(1)(c) with Art. 12(3) |

### Three data subjects, not one

Most of the difficulty here comes from the fact that a single report is about
three different people with three different relationships to the project.

1. **The reporter.** Chose to be here. Can export and erase.
2. **The driver who is photographed.** Did not choose to be here, is not a
   user, cannot be contacted, and is the subject of an allegation. Their
   interests are protected by design decisions rather than by consent, because
   there is no route to their consent.
3. **The person who resolves it.** A public servant acting in their job. Named
   in the audit trail; attributed publicly only as their institution.

## 2. Necessity and proportionality

The photograph is the part that needs justifying, and it is the part that
cannot be dropped. A complaint that a pavement is blocked, with no picture, is
an assertion; the sector halls this app forwards to act on evidence. The
alternative designs were considered and rejected:

- **No photographs.** Makes the report unactionable, which makes the app a
  suggestion box.
- **Photographs blurred or redacted client-side.** Rejected. Nothing here can
  reliably blur a plate, and a preview labelled "redacted" that is not is worse
  than no preview: the reporter believes the app protected somebody it did not.
  So evidence is *absent* for people who should not see it, never faked.
- **Reports anonymous to the database.** Rejected. An unattributable
  allegation is one nobody can withdraw, correct or be answerable for.

The registration number is kept because it is what identifies the vehicle to
the authority that will act. It is not shown to other users, and it now expires
(§4).

## 3. Risks

Severity and likelihood are the author's judgement, before mitigation.

### R1 — A person is photographed and accused, without ever knowing

*Likelihood: certain. Severity: high.* This is the core feature, not an edge
case. The subject has no notice, no way to object and no practical way to find
out the report exists.

**Measures.** The plate is not readable by other users (`0006`, column grants).
The photographs are in a private bucket and reach nobody unsigned (`0009`).
Disclosure to a resolver goes through `evidence_paths()`, which checks that the
office's jurisdiction covers the report's sector and writes a row saying who
looked (`0009`, `0011`). Plate and photographs expire at 12 months (`0009`,
`0012`), on a nightly schedule rather than on paper (`0013`).

**Residual: medium.** A warden in the right sector sees the plate and the
photograph, which is the entire point and cannot be designed away. Nothing
stops a reporter photographing more than the vehicle. Nothing notifies the
subject, and under Art. 14(5)(b) contacting them would require identifying them
from their plate — which would mean building the very capability this design
avoids.

### R2 — A false or malicious report

*Likelihood: likely. Severity: medium.* Reporting is free and the incentive to
misuse it against a neighbour is obvious.

**Measures.** Every report has an author who can be traced by the project. Only
the author may edit it, and not after it is settled. `resolved` requires a
verified institution in the right sector, so a bad report cannot be laundered
into an official finding.

**Residual: high.** There is no moderation, no reporting of reports and no
rate limit. This is genuinely not solved; it is issue #22.

### R3 — A reporter's own movements are reconstructed

*Likelihood: was certain. Severity: medium.* Reports are public and carry a
place, a time and an author. Grouping the city's complaints by author produced
a trace of where somebody was and when — pseudonymous only until one report can
be tied to a person, and one is enough.

**Measures.** `0012` stops returning the author id for anybody but the author,
on the view and on the table. Everything the app asks of that column is "is
this mine", so nothing was lost.

**Residual: low.** Somebody who files reports from home and work still reveals
those places in the reports themselves; the fix removes the key that linked
them together, not the contents.

### R4 — A resolver browses evidence they have no business with

*Likelihood: possible. Severity: high.*

**Measures.** Jurisdiction is checked in the database, not the client
(`0011`). Every disclosure is logged with the role it was made under. The log
survives the looker closing their account (`0012`), and the reporter gets it in
the export from *Contul meu → Datele mele*, which is the only way they would
ever find out.

**Residual: medium.** The subject can obtain the log, but only by exporting a
document and reading it; nobody else reviews it. There is no alerting and no
admin who is expected to look, so the deterrent is whatever a driver does about
a row they had to go looking for.

### R5 — Anonymous accounts make data subject rights unverifiable

*Likelihood: certain. Severity: medium.* Most accounts are anonymous by design
— `signInAnonymously` since `0001`. Whoever holds the phone is that account.

**Measures.** Access and erasure are keyed on `auth.uid()`, so they are
answered to the session and to nobody else. There is no "tell us your uuid and
we will delete it" route, which would be a way to erase somebody else.

**Residual: medium, and accepted.** Somebody who loses their device cannot
exercise either right. Any mechanism that gave it to them would give it to a
stranger claiming to be them, and on an account with no email there is nothing
to prove either way. Signing up with an address fixes it, keeps the same
`auth.users.id`, and is offered — but not forced, because forcing it would put
an identity on every reporter, which is worse for R1 and R2 both.

### R6 — Holders of the service key can read everything

*Likelihood: certain. Severity: high.* The service key bypasses RLS, reads
every plate and signs every photograph, and it is what the retention and
erasure jobs need.

**Measures.** It never ships in a client — the split between
`evidence_past_retention()` and the storage API exists partly to keep it that
way. `erase_me()` and `export_my_data()` are callable with the anon key
precisely so the person does not have to ask somebody with the service key.

**Residual: high, and structural.** This is the project author's own access.
It is mitigated by there being one of them and documented here rather than
claimed to be solved.

### R7 — The de-identified resolution ledger is re-identified

*Likelihood: unlikely. Severity: low.* `official_resolutions` keeps a category,
a sector, and two dates once its report is gone.

**Measures.** It never held the reporter, the plate, the photographs, the
address or the coordinates. Sector granularity is roughly 300,000 people.

**Residual: low.** Somebody holding a copy of the original report could match
it by date and category; they would be matching it against something they
already had.

### R8 — A driver's own parking history becomes a movement log

*Likelihood: certain, by design. Severity: high.* `parkings` holds dated
locations of one person over months, which is where they sleep and where they
work. It is the most sensitive table in this schema, and unlike a report it was
never public in any form.

**Measures.** No policy on the table mentions a role, so no grant — resolver,
admin, or one invented later — widens into reading where somebody else parks;
select, insert and delete are each scoped to `auth.uid()`. Nothing else in the
app reads a row: no map colour, no occupancy count, no ranking. The driver can
delete any entry from the row itself in "Datele mele", and an accidental tap is
undoable where it was made. `erase_me()` deletes the table outright and says
how many rows went.

**Residual: medium.** The rows are still readable by the service key (R6) and
by whoever holds an unlocked phone with the session on it (R5). Nothing here
expires on a clock: a driver who never prunes keeps the lot, which is their
choice to make and the reason the bin is one tap away rather than in a menu.

## 4. Measures, in one list

| | |
|---|---|
| Plate hidden from other users | `0006`, column grants |
| Evidence private, signed, short-lived links | `0009` |
| Disclosure only through a logged function | `0009`, `0011` |
| Jurisdiction enforced in the database | `0011` |
| Resolution requires a verified institution | `0011` |
| Author id hidden from other users | `0012` |
| Plate expires at 12 months | `0012` |
| Photographs expire at 12 months | `0009` |
| Disclosure log expires at 24 months | `0012` |
| Export of everything, including who read your evidence | `0012` |
| Erasure, with what survives stated before the button | `0012` |
| Proof that an erasure was honoured | `0012` |
| Parking history readable and deletable by its driver alone | `0012`, no role in any policy |
| Retention and the second half of erasure run nightly | `0013`, `supabase/functions/retention` |
| A report may only name photographs in its own folder | `0013`, trigger and `evidence_past_retention` |
| The moment a report claims is the moment it arrived | `0013`, trigger |
| No uploads once an erasure is pending | `0013`, storage policies |
| Proof of an erasure expires at three years | `0013` |
| What is held, why and on whose say-so, said in the app | `lib/privacy-notice.ts`, `app/privacy-notice.tsx` |
| Every table has a purpose, basis, retention and deletion rule | `0012`, enforced by `unregistered_tables()` |

## 5. What is not done

Stated plainly, because a DPIA that lists only what was built is a brochure.

- **Nothing has watched the retention jobs run in production.** `0013`
  schedules them and the pure half is tested, but no project has yet been left
  alone for a night with real data in it. The schedule is a fact; that it does
  the right thing at four in the morning is still an assertion. `cron.job_run_details`
  and the function's log are where it would be checked.
- **Nothing alerts when a run fails.** The job reports what it could not delete
  and then it is a line in a log. A week of failures looks exactly like a week
  of quiet nights to anybody not reading them.
- **No moderation.** R2 is unmitigated beyond attribution. Issue #22.
- **Nobody reviews the disclosure log.** The subject can export it; no admin is
  expected to read it and nothing alerts on a pattern.
- **The Article 13 notice names no controller.** *Contul meu → Cum îți folosim
  datele* now says what is held, why, on what basis, who else sees it, for how
  long, what may be demanded and where to complain — everything the article
  asks for except the first thing it asks for. `CONTROLLER` in
  `lib/privacy-notice.ts` is deliberately empty and the screen says so in a red
  box where the name would be, because an address nobody reads is worse than a
  blank. Two lines to fix, and it cannot be published without them.
- **No processor agreements beyond Supabase's standard DPA.** Data is hosted by
  Supabase; the region should be confirmed as EU before any real launch.
- **Not tested on a device.** Every measure above is asserted by a test harness
  against a real Postgres, not by anybody using the app.

## 6. Conclusion

The residual risks are acceptable for a pre-launch project with no public
users. **One line must be filled in before real drivers use it:** the
controller and the contact address in `lib/privacy-notice.ts`. The Article 13
notice around them is written and in the app; the retention schedule that §5
once headed this list with is in `0013`, and what remains of that is that
nobody has watched it work. R2 and R6 should be reassessed at launch.

**Review:** on the next change to any table holding personal data, or when the
app is first published, whichever comes first.
