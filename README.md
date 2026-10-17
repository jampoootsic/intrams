# San Isidro College Events Scoring System

A dynamic, real-time scoring system for inter-college competitions — it manages **three separate competitions**, each with its own judges, candidates, teams, scoring criteria and results:

1. **Mr. & Ms. Isidran Intramurals** — the combined pageant (Jeans, Sports, Cultural, Formal Attire, Talent, Q&A).
2. **Hiphop Dance Competition** — a standalone event with its own judges, roster and criteria (Choreography 40% · Execution 40% · Costume & Props 20%).
3. **Solo Singing Contest** — a standalone event for individual singers (Tone Quality 40% · Interpretation/Delivery/Dynamics 40% · Stage Presence 20%).
4. **Vocal Duet** — a standalone duet event, structured exactly like Solo (same criteria by default, adjustable).
5. **Battle of the Bands** — a standalone band event, structured like Hiphop (band name + team, one band per team) with Planning/Preparedness 30% · Quality of Performance 50% · Interface with Audience 20%.
6. **Extemporaneous Speech** — a standalone individual event (like Solo): Content 40% · Delivery 20% · Pronunciation/Enunciation/Diction 20% · Stage Presence 20%.
7. **Oratorical Speech** — a standalone individual event (like Solo): Vocal Delivery 30% · Emotional Delivery 30% · Physical Delivery 20% · Accuracy 20%.

**Stack:** Node.js (Express + MySQL) backend · React (Vite) frontend.

## Features

- **Top competition switcher** — admins switch between the two competitions; each judge is permanently attached to *one* competition (they only ever see that competition's page).
- **Scoring:** judges enter scores for every candidate of their competition in a live grid (auto-save). Admin can score on behalf of any judge of the selected competition.
- **Results & Winners:** separate results page per competition. Mr. & Ms. gets Mr./Ms. titles, champions and runner-ups per gender plus Best-in-Exposure awards; the Hiphop event produces its own Champion/Runner-up winners and its own Best-in-Segment awards.
- **Candidates / Teams / Judges management** (admin only): each competition has its own candidates, teams and judges.
- **Criteria & Weights** editor (admin only): every criterion and final weight is configurable per competition.
- **Per-exposure photos:** each candidate can have a different photo for every exposure — uploaded in the candidate modal, shown in scoring and Best-in-Segment results.

## Scoring rules (implemented)

Each judge scores every candidate **0–100** per criterion.

| Exposure | Weight (final) | Criteria |
|---|---|---|
| Jeans Attire | 15% | Bearing, Appearance & Physique 40% · Personality & Countenance 30% · Projection & Stage Presence 20% · Appeal to Audience 10% |
| Sports Attire | 15% | same as Jeans |
| Cultural Attire | 15% | same as Jeans |
| Formal Attire | 15% | same as Jeans |
| Talent | 15% | Mastery 40% · Creativity & Originality 30% · Projection & Stage Presence 20% · Audience Impact 10% |
| Question & Answer | 25% | Substance & Appropriateness 40% · Organization of Ideas 30% · English Fluency 30% |
| Hiphop Dance Competition | standalone (0%) | Choreography (Creativity, Artistry & Style Execution) 40% · Execution (Timing & Coordination, Projection & Expression) 40% · Costume & Props 20% |

**How totals are computed**
- *Segment score* = Σ (criteria average across judges × criterion weight / 100)
- *Final score* = Σ (segment score × segment final weight / 100)
- Rankings per gender → Mr. / Ms. (champion), 1st, 2nd, 3rd Runner Up.
- Best per segment per gender → highest segment score.

> **Competitions & judge assignments.** Each competition is judged by a panel of
> **4 judges** (username `judgeN`, password `judgeN`). Each has its own panel
> (Judges tab, top switcher selects the competition):
> - **Mr. & Ms. Isidran Intramurals** — individual candidates ranked Male/Female,
>   judged by `judge1`/`judge1`, `judge2`/`judge2`, `judge15`/`judge15`,
>   `judge16`/`judge16`.
> - **Hiphop Dance Competition** — standalone group event (final weight 0 so it
>   never counts toward the Mr./Ms. finals). There is **no Male/Female split**:
>   each team fields exactly **one dance group** (group name + team), and groups
>   are ranked together as a single list. Judges: `judge3`/`judge3`,
>   `judge4`/`judge4`, `judge17`/`judge17`, `judge18`/`judge18`.
> - **Solo Singing Contest** — standalone individual event (no Male/Female
>   split): soloists are entered as individual contestants (team optional) and
>   ranked in one combined list. Criteria: Tone Quality 40% ·
>   Interpretation/Delivery/Dynamics 40% · Stage Presence
>   (Deportment/Bearing/Discipline) 20%. Judges: `judge5`/`judge5`,
>   `judge6`/`judge6`, `judge19`/`judge19`, `judge20`/`judge20`.
> - **Vocal Duet** — standalone event exactly like Solo (individual entries,
>   no Male/Female split, one combined ranking). Uses the same criteria
>   (adjustable in Criteria &amp; Weights). Judges: `judge7`/`judge7`,
>   `judge8`/`judge8`, `judge21`/`judge21`, `judge22`/`judge22`.
> - **Battle of the Bands** — standalone group event (like Hiphop): a band is
>   entered by band name + team (one band per team), no Male/Female split, one
>   combined ranking. Criteria: Planning/Preparedness 30% · Quality of
>   Performance 50% · Interface with Audience 20%. Judges: `judge9`/`judge9`,
>   `judge10`/`judge10`, `judge23`/`judge23`, `judge24`/`judge24`.
> - **Extemporaneous Speech** — standalone individual event (like Solo): speakers
>   are entered as individual contestants, no Male/Female split, one combined
>   ranking. Criteria: Content 40% · Delivery 20% · Pronunciation, Enunciation
>   &amp; Diction 20% · Stage Presence (Eye Contact, Poise, Personality) 20%.
>   Judges: `judge11`/`judge11`, `judge12`/`judge12`, `judge25`/`judge25`,
>   `judge26`/`judge26`.
> - **Oratorical Speech** — standalone individual event (like Solo): orators are
>   entered as individual contestants, no Male/Female split, one combined
>   ranking. Criteria: Vocal Delivery 30% · Emotional Delivery 30% · Physical
>   Delivery 20% · Accuracy 20%. Judges: `judge13`/`judge13`,
>   `judge14`/`judge14`, `judge27`/`judge27`, `judge28`/`judge28`.
>
> A judge only ever sees the competition they belong to. Admins can create and
> move judges via the Judges tab.

---

## Setup (one time)

### Option A: devenv (Linux/macOS, no XAMPP)
Requires [devenv](https://devenv.sh). MariaDB, Node and all scripts are provided by `devenv.nix`;
no `.env` is needed (DB credentials are set by devenv, data lives in `.devenv/state/mysql`).
```bash
devenv up          # MariaDB → npm install → DB init → API :3010 (--watch) → Vite :5174
```
Production-style run inside the shell:
```bash
devenv up -d mysql
devenv shell
setup              # npm install, build client, init DB
start-server       # serves the built app at http://localhost:3010
```

### Option B: manual (Windows / XAMPP)

### 1. Start MySQL (XAMPP)
Open **XAMPP Control Panel → Start MySQL**.

### 2. Backend
```bash
cd server
npm install
copy .env.example .env     # adjust DB credentials if needed
npm run db:init            # creates DB, tables, seeds competitions, segments + criteria + admin
npm start                  # runs on http://localhost:3010
```

> Port `3010` is used for this system because another local service already uses `3001`.

Default admin login: **username `admin` / password `admin123`** (change after first login via the Judges tab).

### 3. Frontend (development)
Open a second terminal:
```bash
cd client
npm install
npm run dev                # http://localhost:5174 (proxies /api to :3010)
```

### Access from other devices on the same network (development)

The Vite dev server listens on all interfaces (`host: true`), so other devices on the same
Wi-Fi/LAN can open the app using this PC's IP address:

1. Find this PC's LAN IP — e.g. `ipconfig` (looks like `192.168.x.x`).
2. Allow Windows Firewall to accept incoming connections on TCP ports `3010` and `5174`
   (it will show a prompt the first time, or add rules manually).
3. On the other device, open `http://<PC-LAN-IP>:5174`.
   `/api` calls go through the Vite proxy to the backend (`:3010`), so it works exactly like local.

### Production (single port)
```bash
cd client
npm run build              # outputs to client/dist
cd ../server && npm start  # serves the built app at http://localhost:3010
```

> The working directory is inside XAMPP's `htdocs`, but this is a Node app — it runs on its own port and does **not** need Apache/PHP.

## Default admin
- Username: `admin`
- Password: `admin123`
Change it under the **Judges** tab after the first login.