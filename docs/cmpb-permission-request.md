# Cerere de permisiune către CMPB

Textul de trimis la **`parking@cmpb.ro`**, gata de copiat. Nu a fost trimis
încă — vezi starea la finalul fișierului.

De ce se cere: termenii publicați de CMPB sunt contradictorii în privința
reutilizării programatice. Reproducerea este „autorizată, cu menţionarea
sursei" într-o frază, iar copierea „datelor cu care operează" este interzisă
în următoarea. Nu se poate decide din cod care dintre ele se aplică, iar o
aplicație care desenează 768 de parcări municipale nu ar trebui să depindă de
interpretarea noastră.

Fondul faptic al cererii este măsurat, nu estimat:
[`cmpb-data-inventory.md`](./cmpb-data-inventory.md).

---

## Subiect

Solicitare de acord pentru utilizarea datelor publice despre parcările CMPB

## Text

Bună ziua,

Mă numesc Luca Dumitrescu și dezvolt AmLoc, o aplicație gratuită care ajută
șoferii din București să găsească parcare și să raporteze mașinile care
blochează trotuare, treceri de pietoni și rampe de acces.

Aplicația afișează parcările pe care le operați, pe baza fișierului
`parking-lots.geojson` pe care site-ul dumneavoastră îl folosește public
pentru a-și desena harta. Vă scriu pentru a obține un acord scris, înainte de
lansare, și pentru a mă asigura că modul în care folosim datele este cel pe
care îl considerați acceptabil.

**Ce preluăm**

Pentru fiecare dintre cele 768 de parcări din București: codul parcării,
denumirea, coordonatele, numărul de locuri și tariful orar. Nimic altceva.

**Cât de des**

O singură descărcare, făcută manual, la momentul construirii aplicației.
Ultima a fost pe 7 august 2026. Nu există interogare automată și nici
reîmprospătare periodică. Telefoanele utilizatorilor nu contactează niciodată
serverele dumneavoastră — datele sunt incluse în aplicație. Indiferent câți
utilizatori are AmLoc, sarcina asupra infrastructurii dumneavoastră rămâne
aceeași.

**Ce nu afirmăm**

Nu afirmăm și nu deducem gradul de ocupare. Numărul de locuri este afișat ca
fiind capacitatea marcată de dumneavoastră, niciodată ca număr de locuri
libere. Înțelegem că nu publicați date de ocupare.

**Ce vă rugăm să confirmați**

1. Dacă sunteți de acord ca datele să fie folosite în acest fel.
2. Dacă acordul acoperă și o eventuală utilizare comercială viitoare — AmLoc
   este gratuită acum, iar dacă acest lucru se schimbă preferăm să știm dinainte.
3. Cum doriți să fie formulată atribuirea și unde să apară.
4. Dacă există o frecvență maximă de preluare pe care o considerați acceptabilă,
   în cazul în care vom actualiza datele mai des.
5. Dacă preferați o altă modalitate de acces — un export, un API, sau un fișier
   pe care ni-l furnizați periodic.

Dacă utilizarea nu este acceptabilă în forma descrisă, vă rog să ne spuneți:
vom elimina datele dumneavoastră din aplicație. Preferăm o hartă mai săracă
uneia făcute fără acordul dumneavoastră.

Sunt disponibil pentru orice detaliu tehnic. Codul aplicației este public la
`https://github.com/lucadumi/am-loc`, inclusiv scriptul care preia datele.

Cu stimă,
Luca Dumitrescu
AmLoc

---

## Stare

**Netrimisă.** Actualizați această secțiune când se schimbă, și adăugați
răspunsul în acest director când sosește — issue-ul #7 se închide când
depozitul conține permisiunea scrisă sau termenii de licențiere, nu când
cererea a fost trimisă.

| Data | Ce s-a întâmplat |
|---|---|
| — | — |

Dacă nu vine niciun răspuns în trei-patru săptămâni, merită o relansare, apoi
o solicitare formală în baza Legii 544/2001 privind liberul acces la
informațiile de interes public: CMPB este companie municipală, iar datele
despre parcările pe care le operează sunt informații de interes public. Aceasta
este o cale separată de permisiunea de reutilizare, dar produce un document
citabil.
