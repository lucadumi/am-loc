<!-- Improved compatibility of back to top link: See: https://github.com/othneildrew/Best-README-Template/pull/73 -->
<a id="readme-top"></a>



<!-- PROJECT LOGO -->
<br />
<div align="center">

<h3 align="center">AmLoc</h3>

  <p align="center">
    A community-driven mobile app for Bucharest's parking problem.
    <br />
    <a href="https://github.com/lucadumi/am-loc"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://github.com/lucadumi/am-loc/issues/new?labels=bug">Report Bug</a>
    &middot;
    <a href="https://github.com/lucadumi/am-loc/issues/new?labels=enhancement">Request Feature</a>
  </p>
</div>



<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li>
      <a href="#connecting-a-backend">Connecting a backend</a>
      <ul>
        <li><a href="#how-the-data-is-shaped">How the data is shaped</a></li>
        <li><a href="#why-an-old-claim-is-still-shown">Why an old claim is still shown</a></li>
      </ul>
    </li>
    <li>
      <a href="#product-notes">Product notes</a>
      <ul>
        <li><a href="#what-makes-the-map-live">What makes the map live</a></li>
      </ul>
    </li>
    <li><a href="#development-and-ci">Development and CI</a></li>
    <li><a href="#project-structure">Project structure</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>



<!-- ABOUT THE PROJECT -->
## About The Project

**AmLoc** ("un loc" = *a spot*) is a community-driven mobile app that tackles Bucharest's
parking problem: too many cars, too few spots, and cars parked on sidewalks causing conflict.

Unlike the existing payment apps (Parking București, UPPARK, AmParcat), AmLoc focuses on the
gap they ignore:

- **The parking nearest you, first**: 97 real Bucharest car parks imported from
  OpenStreetMap, ranked by how far you have to walk and what they cost. Nothing here claims
  a space is free unless somebody said so.
- **A spot detail worth opening**: the map closes onto the kerb, and a private spot shows
  the intervals its owner is offering it. Only the owner may say when it is free — enforced
  in Postgres, not just in the app.
- **Report a blocker**: snap a photo, auto-tag the location and category (sidewalk, access
  ramp, crosswalk, bike lane, double-parking).
<p align="right">(<a href="#readme-top">back to top</a>)</p>



### Built With

* [![Expo][Expo.dev]][Expo-url]
* [![Expo Router][ExpoRouter]][ExpoRouter-url]
* [![TypeScript][TypeScript]][TypeScript-url]
* [![React Native][ReactNative]][ReactNative-url]
* [![Supabase][Supabase]][Supabase-url]
* [![PostgreSQL][PostgreSQL]][PostgreSQL-url]
* [![PostGIS][PostGIS]][PostGIS-url]
* [![NativeWind][NativeWind]][NativeWind-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- GETTING STARTED -->
## Getting Started

To get a local copy up and running, install the Expo app and run the development server.
A fresh clone works without a backend and opens on a Bucharest map seeded with sample spots
and reports.

### Prerequisites

* Node.js `>=22.18`
* npm
* Expo Go on iOS/Android, or an iOS/Android simulator

### Installation

1. Clone the repo
   ```sh
   git clone https://github.com/lucadumi/am-loc.git
   cd am-loc
   ```
2. Install dependencies
   ```sh
   npm install
   ```
3. Start Expo
   ```sh
   npx expo start
   ```
4. Open the project in **Expo Go** (iOS/Android) or a simulator.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- USAGE EXAMPLES -->
## Usage

The app opens on the parking nearest to you, closest first and cheapest among equals,
drawn from 97 real Bucharest car parks imported from OpenStreetMap plus whatever drivers
have announced. The map shows the same spots and the blocker reports filed against them.
Tapping one opens its detail: the map closes onto the kerb, the facts about the space sit
under it with how much to believe its status, and a private spot shows the intervals its
owner is offering.

From **Adaugă** you can report a car blocking a pavement, ramp or crossing.

Four screens are built: home, the map, the blocker report and the spot detail. Adding a
spot, search, the reports list and the profile are placeholders, and the logic behind them
is not written yet rather than half-written and left to rot. Nothing renders a fact the
app cannot stand behind — a bay is never drawn free because a random number said so.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- CONNECTING A BACKEND -->
## Connecting a backend

The app runs with no backend at all: with no credentials it uses the seed spots in
`lib/api.ts` and keeps everything else on the device, so a fresh clone opens on a working
map. The Supabase half is written and waiting — `lib/supabase*.ts` and `types/database.ts`
describe exactly the schema it expects — but the migrations that create that schema are not
in the repo yet, so the remote path is not connectable today.

The switch is the presence of both environment variables, checked in `lib/remote.ts`.
Nothing falls back to the seed data once a project is configured: an empty `spots` table is
a real answer, and padding it with invented kerbs would be a map that lies.

Drivers are signed in anonymously, so that saying "this kerb is free" does not require
making an account first. The anonymous user is a real row in `auth.users`, so a standing
can accrue to it and an email can be linked to it later.

### How the data is shaped

The one thing worth knowing: **a status is not a property of a piece of ground.** A spot's
status is the current state of an argument about it, so `spots` carries no status column;
claims are rows in `status_reports` and the app's `spot.status` is the newest one flattened
back on by `lib/supabase-rows.ts`. `reports` works the same way — where a complaint got to
is a history in `report_events`, not a field.

That is what lets a newer claim outweigh an older one instead of overwriting it, so a kerb
two drivers disagree about is drawn as contested rather than flipping to whoever spoke last.

A private spot is the exception, and deliberately so: its availability is not an argument at
all. Only its owner may set it, through `availability_windows`, and the schema is meant to
refuse a status report filed against one rather than leaving that to the client. Letting an
owner offer their own space is lawful in Romania; doing the same with a public kerb is not.

A spot inserted on its own has nothing claimed about it and reads as taken from the moment
it was created, which is the honest default: the imported car parks arrive exactly that
way and are drawn grey until somebody who was there says otherwise.

### Why an old claim is still shown

The read window in `lib/supabase-data.ts` is thirty days, and that number is doing
something less obvious than paging. Because a spot with no claim at all reads as
`taken`, a short window does not age a kerb gracefully: it deletes it. At 23 hours a
spot is "Liber, învechit" and a driver can judge it; at 25 hours, under a one-day
window, the same spot would vanish from every free-spots list and the map would turn it
red on no evidence. A city whose reports paused for a day would show as a city with
nothing free in it.

Nothing about the ranking changes at thirty days: the longest half-life is 25 minutes,
so anything that old carries no weight. What it buys is that the belief model gets to
do the ageing, which is its job: the claim comes back, decays to `stale`, and is drawn
hollow and sorted last rather than removed by a `where` clause.

`describeConfidence` covers the other half. Past about three days a claim's weight
underflows to zero in floating point, which makes the belief indistinguishable from one
about a kerb nobody has ever looked at. `considered` tells them apart: it counts what
was weighed, not what survived, so an expired claim reads *Învechit* rather than
*Fără raportări*. `source` stays null either way; a driver arriving today must not move
the standing of somebody who said "free" last week.

## Product notes

### What makes the map live

A screen could reload when it is focused, and only then. That would leave a driver
staring at the map while somebody two streets away announced a space seeing nothing, and
a driver acting on a kerb taken thirty seconds earlier driving to it anyway. For a map
whose whole value is being more current than the street, refreshing when you leave and
come back is the wrong shape.

`lib/live.ts` is one feed with two sources. Writes made on this device publish to it,
so the no-backend build is live too and the announcer's own map updates in the same
frame instead of after a round trip; with a project configured, a Postgres change feed
publishes the same topics. A screen subscribes to `"spots"` or `"reports"` and never
has to know which world it is in.

The change payload is deliberately thrown away and the screen refetches. Applying a
diff by hand would mean a second implementation of the flattening in `supabase-rows.ts`
and of the belief model on top of it, and the two would drift.

Channels are refcounted per topic and their opens and closes are serialised, which is
less fussy than it sounds. Navigation blurs the screen you are leaving before it
focuses the one you are entering, so two screens watching the same topic hand it over
through a moment when nobody is watching: the channel closes and immediately reopens.
Allowed to overlap, the reopen is handed back the instance the close is still tearing
down, `subscribe()` does nothing because that channel has not closed yet, and the map
spends the rest of the session listening to something dead. It is a silent failure with
a live-looking screen in front of it, so `subscribe` also carries a status callback:
0003 warns that the worst outcome here is the one that reports success, and a channel
that cannot join says so in the log rather than looking like a quiet city.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- DEVELOPMENT AND CI -->
## Development and CI

Fast local checks:

```bash
npx tsc --noEmit
npm run lint
npm test
```

The repository has CI at `.github/workflows/ci.yml`. It runs on pushes to `main` and pull
requests, uses Node 24, installs with `npm ci`, then type-checks, lints and runs the
unit tests for the deterministic core (the belief model, reporter records, status reports).
It deliberately does **not** build the app or start Metro: an Expo build needs a simulator
or EAS credentials, takes minutes, and would not catch anything these three do not.

The tests need no simulator because everything they cover is pure: functions over plain
objects with the clock injected, and an in-memory stand-in for AsyncStorage. That is what
makes a mobile app testable in CI at all.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- PROJECT STRUCTURE -->
## Project structure

```
app/
  _layout.tsx            # fonts, gesture root, safe area, stack
  (tabs)/
    _layout.tsx          # bottom tab bar (Acasă / Hartă / Adaugă / Sesizări / Profil)
    index.tsx            # home: the parking nearest you, closest and cheapest first
    map.tsx              # map: spots, blocker reports, floating controls, filters
    add.tsx              # chooser: add a parking spot, or report a blocker
    reports.tsx          # placeholder
    profile.tsx          # placeholder
  add-spot.tsx           # placeholder
  report.tsx             # report a blocker (photo, location, category)
  garage.tsx             # spot detail: the map, the facts, and the owner's offer
  nearby.tsx             # placeholder
  search.tsx             # placeholder
components/
  ui/input.tsx           # the app's only text field, so padding cannot drift
  interval-slider.tsx    # days and hours, for an interval no preset covers
  …                      # spot-card, status-badge, floating-control, wip
constants/
  public-parking.ts      # generated: 97 real Bucharest car parks, from OSM
  theme.ts               # palette, status and confidence wording
lib/
  api.ts                 # spots, blocker reports, and the nearby ranking
  location.ts            # GPS, then the public IP, then the city centre
  spot-state.ts          # the belief model: decay and corroboration
  spot-belief.ts         # bridges the model to the spots the screens hold
  spot-reports.ts        # status reports: the claims a belief is built from
  private-spots.ts       # who may say a private spot is free, and when
  availability-windows.ts# the intervals an owner is offering
  bucharest-time.ts      # the wall clock both of those are read against
  filters.ts             # the map's filter predicate
  live.ts                # one feed: local writes and the Postgres change feed
  identity.ts            # who this device writes as, resolved once and cached
  remote.ts              # whether a backend is configured at all
  supabase*.ts           # the client, the queries, and pure row mapping
scripts/
  fetch-parking.mjs      # regenerates constants/public-parking.ts from Overpass
types/                   # ParkingSpot, AvailabilityWindow, database rows
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- ROADMAP -->
## Roadmap

- [ ] Write the Postgres schema the client already expects, as migrations.
- [ ] Build adding a spot, and the kerb layer that checks where the pin falls.
- [ ] Build the running parking session: park, and hand the kerb back on the way out.
- [ ] Build search: find parking near where you are going, not only near where you are.
- [ ] Build the reports list, notifications, saved spots and the profile.
- [ ] Verify ownership before a private spot can be listed.
- [ ] Survey which kerbs are the blue zone: no open dataset has it.

See the [open issues](https://github.com/lucadumi/am-loc/issues) for a full list of proposed features and known issues.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- CONTRIBUTING -->
## Contributing

Issues and pull requests are welcome.

If you have a suggestion, open an issue with the tag `enhancement`, or fork the repo and send a pull request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Top contributors:

<a href="https://github.com/lucadumi/am-loc/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=lucadumi/am-loc" alt="contrib.rocks image" />
</a>



<!-- LICENSE -->
## License

All rights reserved. The source is readable for evaluation, not reusable. See
[`LICENSE`](LICENSE) for what that permits.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- CONTACT -->
## Contact

Luca Dumitrescu - lucadumi07@gmail.com

Project Link: [https://github.com/lucadumi/am-loc](https://github.com/lucadumi/am-loc)

Portfolio: [https://lucaos.vercel.app](https://lucaos.vercel.app)

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- ACKNOWLEDGMENTS -->
## Acknowledgments

* [Expo](https://expo.dev/)
* [React Native](https://reactnative.dev/)
* [Supabase](https://supabase.com/)
* [PostGIS](https://postgis.net/)
* [Best-README-Template](https://github.com/othneildrew/Best-README-Template)

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- MARKDOWN LINKS & IMAGES -->
[Expo.dev]: https://img.shields.io/badge/Expo-000020?style=for-the-badge&logo=expo&logoColor=white
[Expo-url]: https://expo.dev/
[ExpoRouter]: https://img.shields.io/badge/Expo_Router-000020?style=for-the-badge&logo=expo&logoColor=white
[ExpoRouter-url]: https://docs.expo.dev/router/introduction/
[TypeScript]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[TypeScript-url]: https://www.typescriptlang.org/
[ReactNative]: https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[ReactNative-url]: https://reactnative.dev/
[Supabase]: https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white
[Supabase-url]: https://supabase.com/
[PostgreSQL]: https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white
[PostgreSQL-url]: https://www.postgresql.org/
[PostGIS]: https://img.shields.io/badge/PostGIS-336791?style=for-the-badge&logo=postgresql&logoColor=white
[PostGIS-url]: https://postgis.net/
[NativeWind]: https://img.shields.io/badge/NativeWind-38BDF8?style=for-the-badge&logo=tailwindcss&logoColor=white
[NativeWind-url]: https://www.nativewind.dev/
