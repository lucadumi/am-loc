# Dacă CMPB refuză, sau nu răspunde

Ce se întâmplă cu aplicația dacă permisiunea cerută în
[`cmpb-permission-request.md`](./cmpb-permission-request.md) este refuzată,
retrasă, sau pur și simplu ignorată.

Documentul acesta există pentru că issue-ul #7 îl cere explicit, dar și pentru
un motiv mai practic: dacă răspunsul e „nu", decizia se ia sub presiune de
timp, iar un plan scris dinainte e mai bun decât unul improvizat.

## Ce se pierde

CMPB este singura sursă de tarife pe care o are aplicația.

| | CMPB | OpenStreetMap |
|---|---|---|
| Parcări | 768 | 83 |
| Cu tarif | 768 | 2 |
| Cu capacitate | 768 | 23 |
| Locuri însumate | 49.915 | parțial |

Fără CMPB rămân **83 de parcări**, dintre care **2** au tarif. Restul poartă
cel mult `paid: true` fără sumă — 27 dintre ele — sau nu spun nimic.

Harta nu devine goală, dar devine o hartă cu o gaură în ea, exact în centru,
unde e zona albastră: locurile pe care un șofer chiar le caută sunt cele pe
care nu le-ar mai vedea.

## Ce se face, în ordine

**1. Se scot datele.** Se șterge `constants/cmpb-parking.ts` și importul lui
din `lib/api.ts`. `IMPORTED_PARKING` rămâne doar cu stratul OSM. Nimic altceva
nu trebuie modificat: `SpotSource` păstrează valoarea `"cmpb"`, iar codul care
o citește pur și simplu nu o mai întâlnește.

Costul e o oră, nu o refacere. Separarea a fost făcută cu asta în minte:
straturile sunt fișiere distincte, îmbinate într-un singur loc.

**2. Se golesc rândurile importate**, dacă `scripts/import-parking.mjs` a fost
rulat pe un proiect Supabase:

```sql
delete from public.spots where source = 'cmpb';
```

Se șterge în cascadă `availability_windows`, ceea ce nu are efect practic — o
parcare publică nu poate avea ferestre, prin trigger-ul din `0002`.

**3. Se spune pe hartă ce lipsește.** O hartă a Bucureștiului fără zona
albastră arată ca o hartă stricată, nu ca una restrânsă. Preferabil un rând
onest — „Zona albastră nu este afișată" — decât o absență tăcută pe care
șoferul o citește ca pe un defect.

## Ce se poate face în locul lor

**Datele proprii ale șoferilor.** Aplicația poate deja să înregistreze prețuri
introduse de utilizatori; nu există un ecran pentru asta, dar schema le
suportă. 768 de parcări nu se acoperă așa, iar o parcare cu prețul greșit e
mai rea decât una fără preț — vezi comentariul lui `priceRank` din
`lib/api.ts`.

**Legea 544/2001.** CMPB este companie municipală, iar tarifele pe care le
practică sunt informații de interes public. O solicitare formală e o cale
separată de permisiunea de reutilizare și mai lentă, dar produce un document
citabil. Merită încercată înainte de a renunța.

**OpenStreetMap.** Tarifele pot fi adăugate în OSM de oricine le observă pe
teren. Sunt date deschise, licențiate ODbL, deci întrebarea nu se mai pune.
Este calea lentă și singura care nu depinde de nimeni.

## Dacă nu vine niciun răspuns

Tăcerea nu este un acord, dar nici un refuz.

Poziția actuală — o singură descărcare la construire, nicio interogare de pe
telefoane, sursa numită, nicio pretenție de ocupare — este cea mai apărabilă
utilizare a unui fișier public pe care o putem alege fără un răspuns. Ea nu
devine permisiune. Documentul acesta și cererea alăturată sunt urma scrisă a
faptului că s-a întrebat.

Ce nu ar trebui făcut fără un răspuns: creșterea frecvenței de preluare,
preluarea de pe telefoanele utilizatorilor, sau vânzarea a ceva construit pe
aceste date. Toate trei transformă o utilizare defensabilă într-una care nu
mai e.
