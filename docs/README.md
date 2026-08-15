# docs

Ce nu încape într-un comentariu din cod: decizii care privesc lumea din afara
depozitului.

## Datele CMPB

768 din cele 851 de parcări pe care le desenează AmLoc vin de la Compania
Municipală Parking București, prin fișierul public pe care aplicația lor web
îl folosește ca să își deseneze harta. Sunt și singura sursă de tarife pe care
o are aplicația.

Termenii publicați de CMPB sunt contradictorii în privința reutilizării
programatice, iar asta nu se poate decide din cod.

- [`cmpb-permission-request.md`](./cmpb-permission-request.md) — cererea de
  trimis la `parking@cmpb.ro`, cu starea ei
- [`cmpb-data-inventory.md`](./cmpb-data-inventory.md) — ce se preia exact,
  măsurat din fișierele generate
- [`cmpb-fallback.md`](./cmpb-fallback.md) — ce rămâne din aplicație dacă
  răspunsul e „nu"

Dacă schimbați ce citește `scripts/fetch-cmpb-parking.mjs`, actualizați
inventarul: el este ce i s-a spus CMPB.
