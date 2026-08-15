# Datele CMPB folosite de AmLoc

Inventarul exact al datelor preluate de la Compania Municipală Parking
București, măsurat din fișierele generate și nu din memorie. Însoțește cererea
din [`cmpb-permission-request.md`](./cmpb-permission-request.md), pentru ca ea
să descrie ce face aplicația și nu ce ne-am dori să facă.

Cifrele de mai jos sunt din `constants/cmpb-parking.ts`, generat la
**2026-08-07** de `scripts/fetch-cmpb-parking.mjs`.

## Sursa

`https://parkingbucuresti.ro/parking-lots.geojson`

Fișierul pe care aplicația web a CMPB îl cere singură, neautentificat, ca să
își deseneze harta. Nu este publicat ca set de date deschis și nu are termeni
de licențiere atașați — ceea ce este exact motivul pentru care se cere
permisiunea.

## Ce se preia

Cinci câmpuri per parcare, plus identificatorul:

| Câmp | Din | Exemplu |
|---|---|---|
| `code` | `properties.code` | `P0101` |
| `title` | textul dinaintea lui `Cod:` din `properties.description` | `Academiei` |
| `latitude`, `longitude` | `geometry.coordinates` | `44.43623962, 26.09934861` |
| `totalCount` | `Locuri: (\d+)` din descriere | `104` |
| `pricePerHour` | `(\d+) lei / oră` din descriere | `5` |

**Restul fișierului nu se citește.** Descrierea se folosește doar ca text din
care se extrag cele trei valori de mai sus; nimic altceva din `properties` nu
ajunge în aplicație.

`area` — „Sector 1 · Teatrului" — **nu vine de la CMPB**. Este adăugat separat
de `scripts/fetch-areas.mjs` prin geocodare inversă din OpenStreetMap, pornind
de la coordonate.

## Cât

- **768** de parcări, toate în limitele administrative ale Bucureștiului
- **768** cu capacitate, însumând **49.915** locuri (între 4 și 1.248 per parcare)
- **768** cu tarif, două valori distincte: **5 lei/oră** și **20 lei/oră**

## Cât de des

**O singură descărcare, manual, la momentul construirii.** Nu există
reîmprospătare automată, nici sondare periodică. Scriptul se rulează de un
dezvoltator, scrie un fișier TypeScript, iar acel fișier este comis în
depozit.

**Telefoanele șoferilor nu contactează niciodată `parkingbucuresti.ro`.**
Aplicația citește constanta din pachetul propriu. Indiferent câți utilizatori
are AmLoc, sarcina asupra infrastructurii CMPB rămâne o cerere per generare.

Ultima preluare: **2026-08-07**.

## Ce nu se pretinde

**Nicio ocupare.** `Locuri: 104` este câte locuri a marcat CMPB, nu câte sunt
libere. CMPB nu publică ocuparea nicăieri — steagul `closed` din propriul lor
popup este o valoare implicită Alpine.js, un inițializator de interfață și nu
o stare. Aplicația nu afișează niciun număr de locuri libere pentru aceste
parcări și nici nu îl deduce.

Fiecare parcare poartă `source: "cmpb"` și este desenată ca înregistrare, nu
ca observație.

## Atribuire, așa cum este acum

Fiecare parcare CMPB poartă `source: "cmpb"` în date. Cererea întreabă ce
formulare de atribuire este acceptabilă, pentru că aceasta este de decis de
CMPB și nu de noi.

## Fără CMPB

Vezi [`cmpb-fallback.md`](./cmpb-fallback.md). Pe scurt: rămân 83 de parcări
din OpenStreetMap, din care **2** au tarif — față de 768 cu tarif de la CMPB.
