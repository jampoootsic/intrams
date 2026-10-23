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

## Stack

- **Database:** Postgres (Neon in production, local Postgres via devenv). Schema + idempotent seed: `server/db/schema.sql`, `server/db/init.js`.
- **API:** Express (`server/app.js`); run locally by `server/index.js`, on Vercel as the serverless function `api/index.js`.
- **Client:** React + Vite (`client/`), served from `client/dist`. Same-origin `/api` calls (see `vercel.json` rewrites).
- **Photos:** Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set, otherwise `server/uploads/` on disk (`server/utils/storage.js`). The client downscales images to ≤1600px JPEG before upload (`client/src/utils/image.js`).
- **Realtime:** every write bumps `settings.data_version`; clients poll `GET /api/settings/version` every 2 s (`client/src/hooks/useLiveRefresh.js`) and reload on change. Unsaved score cells are never overwritten.

## Local development (devenv)

Requires [devenv](https://devenv.sh). Postgres, Node and all scripts come from `devenv.nix`; no `.env` needed (data lives in `.devenv/state/postgres`).
```bash
devenv up          # postgres → npm install → DB init → API :3010 (--watch) → Vite :5174
```
Production-style run inside the shell:
```bash
devenv up -d postgres
devenv shell
setup              # npm install, build client, init DB
start-server       # serves the built app at http://localhost:3010
```

### Without devenv
Needs Node 20+ and a Postgres you can reach.
```bash
cp .env.example .env       # set DATABASE_URL (and JWT_SECRET)
npm install && npm run db:init
npm run dev                # API on http://localhost:3010
cd client && npm install && npm run dev   # http://localhost:5174, proxies /api to :3010
```

Other devices on the same LAN can open `http://<PC-LAN-IP>:5174` (Vite listens on all interfaces; allow TCP 3010 and 5174 through the firewall).

## Production (Neon + Vercel)

Live: https://sic-intrams.vercel.app

- Neon project `sic-intrams` (ap-southeast-1); Vercel project `sic-intrams`, functions pinned to `sin1`.
- Vercel env: `DATABASE_URL` (Neon **pooled** URL, `sslmode=require`), `JWT_SECRET`, `BLOB_READ_WRITE_TOKEN` (store `sic-intrams-photos`, linked automatically).
- Deploy: `vercel deploy --prod`. Schema/seed changes: `DATABASE_URL=<neon url> npm run db:init` (idempotent).
- Demo data: `npm run db:seed`. Wipe scores/candidates/non-admin judges: `node server/db/cleanup.js` (destructive).


## Default admin
- Username: `admin`
- Password: `admin123`
Change it under the **Judges** tab after the first login.