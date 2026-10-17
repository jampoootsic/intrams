import bcrypt from 'bcryptjs';
import db from '../db.js';

// Idempotent demo-data seeder.
// Ensures, for every competition:
//   - 4 shared teams (same names/colours across all events)
//   - Mr & Ms: 3 pairs (3 Male + 3 Female) — existing candidates are kept
//   - each standalone event: 4 participants, 1 per team
//   - 4 judges per event (existing judges are kept)
// Run:  node server/db/seed.mjs   (from the repo root, after node server/db/init.js)


const TEAMS = [
  { name: 'Valian Panthers', color: '#2753a0', sort: 1 },
  { name: 'Tycoons', color: '#fdf50d', sort: 2 },
  { name: 'Vermillion Vanguards', color: '#a02c2c', sort: 3 },
  { name: 'Blazing Phoenix', color: '#da2de6', sort: 4 },
];

const MR_MS_PAIRS = [
  { no: '01', first: 'Marichu',   last: 'Villa',        gender: 'Male',   team: 'Valian Panthers' },
  { no: '01', first: 'Mariche',   last: 'Villahermosa', gender: 'Female', team: 'Valian Panthers' },
  { no: '02', first: 'Miguel',    last: 'Santos',       gender: 'Male',   team: 'Tycoons' },
  { no: '02', first: 'Isabel',    last: 'Reyes',        gender: 'Female', team: 'Tycoons' },
  { no: '03', first: 'Jose',      last: 'Dela Cruz',    gender: 'Male',   team: 'Vermillion Vanguards' },
  { no: '03', first: 'Maria',     last: 'Garcia',       gender: 'Female', team: 'Vermillion Vanguards' },
  { no: '04', first: 'Ramon',     last: 'Castro',       gender: 'Male',   team: 'Blazing Phoenix' },
  { no: '04', first: 'Lucia',     last: 'Fernandez',    gender: 'Female', team: 'Blazing Phoenix' },
];

const STANDALONE_PARTICIPANTS = {
  solo: [
    { no: '01', first: 'Ace',   last: 'Tamayo' }, { no: '02', first: 'Bella', last: 'Ocampo' },
    { no: '03', first: 'Carlo', last: 'Dizon' },  { no: '04', first: 'Dina',  last: 'Navarro' },
  ],
  'vocal-duet': [
    { no: '01', first: 'Evan', last: 'Bautista' }, { no: '02', first: 'Faye', last: 'Mercado' },
    { no: '03', first: 'Gino', last: 'Ramos' },    { no: '04', first: 'Hara', last: 'Villanueva' },
  ],
  speech: [
    { no: '01', first: 'Ira',  last: 'Mendoza' }, { no: '02', first: 'Juan', last: 'Sison' },
    { no: '03', first: 'Kyla', last: 'Aquino' },  { no: '04', first: 'Luis', last: 'Abad' },
  ],
  oratorical: [
    { no: '01', first: 'Mia',    last: 'Castillo' }, { no: '02', first: 'Nico',  last: 'Marquez' },
    { no: '03', first: 'Olivia', last: 'Pascual' },  { no: '04', first: 'Pio',   last: 'Estrada' },
  ],
  hiphop: [
    { no: '01', group: 'Valian Panthers Crew' }, { no: '02', group: 'Tycoons Crew' },
    { no: '03', group: 'Vermillion Vanguards Crew' }, { no: '04', group: 'Blazing Phoenix Crew' },
  ],
  bands: [
    { no: '01', group: 'Valian Panthers Band' }, { no: '02', group: 'Tycoons Band' },
    { no: '03', group: 'Vermillion Vanguards Band' }, { no: '04', group: 'Blazing Phoenix Band' },
  ],
};

const EXTRA_JUDGES = {
  'mr-ms':      [{ name: 'Judge15', username: 'judge15' }, { name: 'Judge16', username: 'judge16' }],
  hiphop:       [{ name: 'Judge17', username: 'judge17' }, { name: 'Judge18', username: 'judge18' }],
  solo:         [{ name: 'Judge19', username: 'judge19' }, { name: 'Judge20', username: 'judge20' }],
  'vocal-duet': [{ name: 'Judge21', username: 'judge21' }, { name: 'Judge22', username: 'judge22' }],
  bands:        [{ name: 'Judge23', username: 'judge23' }, { name: 'Judge24', username: 'judge24' }],
  speech:       [{ name: 'Judge25', username: 'judge25' }, { name: 'Judge26', username: 'judge26' }],
  oratorical:   [{ name: 'Judge27', username: 'judge27' }, { name: 'Judge28', username: 'judge28' }],
};

const log = console.log;
let added = { teams: 0, candidates: 0, judges: 0 };

async function getCompByCode(code) {
  const [[row]] = await db.query('SELECT id FROM competitions WHERE code = ? LIMIT 1', [code]);
  return row ? row.id : null;
}

async function ensureTeam(compId, t) {
  const [[row]] = await db.query(
    'SELECT id FROM teams WHERE competition_id = ? AND name = ? LIMIT 1', [compId, t.name]
  );
  if (row) return row.id;
  const [[res]] = await db.query(
    'INSERT INTO teams (competition_id, name, color, sort_order) VALUES (?, ?, ?, ?) RETURNING id',
    [compId, t.name, t.color, t.sort]
  );
  added.teams += 1;
  log(`  + team "${t.name}" for comp ${compId}`);
  return res.id;
}

async function addCandidate(compId, { no, first, last, gender, group, teamId }, mrMs) {
  if (!teamId) return;
  let exists;
  if (mrMs) {
    [[exists]] = await db.query(
      'SELECT id FROM candidates WHERE competition_id = ? AND candidate_no = ? AND gender = ? LIMIT 1',
      [compId, no, gender]
    );
  } else {
    [[exists]] = await db.query(
      'SELECT id FROM candidates WHERE competition_id = ? AND candidate_no = ? LIMIT 1', [compId, no]
    );
  }
  if (exists) return;
  if (group) {
    await db.query(
      'INSERT INTO candidates (competition_id, candidate_no, group_name, gender, team_id, active) VALUES (?, ?, ?, NULL, ?, 1)',
      [compId, no, group, teamId]
    );
  } else {
    await db.query(
      'INSERT INTO candidates (competition_id, candidate_no, first_name, last_name, gender, team_id, active) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [compId, no, first || null, last || null, gender || null, teamId]
    );
  }
  added.candidates += 1;
  log(`  + candidate ${no} (${group || ((first || '') + ' ' + (last || '')).trim() || ''}) for comp ${compId}`);
}

async function ensureJudges(compId, code) {
  const list = EXTRA_JUDGES[code] || [];
  for (const j of list) {
    const [[row]] = await db.query('SELECT id FROM judges WHERE username = ? LIMIT 1', [j.username]);
    if (row) continue;
    const hash = bcrypt.hashSync(j.username, 10);
    await db.query(
      'INSERT INTO judges (name, username, password, is_admin, competition_id) VALUES (?, ?, ?, 0, ?)',
      [j.name, j.username, hash, compId]
    );
    added.judges += 1;
    log(`  + judge ${j.name} (${j.username}) for comp ${compId}`);
  }
}

// -- Resolve competition ids --
const compIds = {};
for (const code of ['mr-ms', 'hiphop', 'solo', 'vocal-duet', 'bands', 'speech', 'oratorical']) {
  compIds[code] = await getCompByCode(code);
}

log('\n== Teams (shared across all events) ==');
const teamIdByComp = {};
for (const code of Object.keys(compIds)) {
  const cid = compIds[code];
  if (!cid) continue;
  teamIdByComp[code] = {};
  for (const t of TEAMS) teamIdByComp[code][t.name] = await ensureTeam(cid, t);
}
log(`teams added: ${added.teams}`);

log('\n== Mr & Ms: 3 pairs (6 candidates) ==');
for (const p of MR_MS_PAIRS) {
  const tid = teamIdByComp['mr-ms']?.[p.team];
  await addCandidate(compIds['mr-ms'], { ...p, teamId: tid }, true);
}
log(`mr-ms candidates added: ${added.candidates}`);

log('\n== Standalone events: 4 participants per event (1 per team) ==');
for (const [code, parts] of Object.entries(STANDALONE_PARTICIPANTS)) {
  const cid = compIds[code];
  if (!cid) continue;
  log(`-- ${code} (comp ${cid}) --`);
  let i = 0;
  for (const p of parts) {
    const tid = teamIdByComp[code][TEAMS[i].name];
    await addCandidate(cid, { ...p, teamId: tid }, false);
    i += 1;
  }
}
log(`standalone candidates added: ${added.candidates}`);

log('\n== Judges: 4 per event ==');
for (const [code, cid] of Object.entries(compIds)) {
  if (!cid) continue;
  await ensureJudges(cid, code);
}
log(`judges added: ${added.judges}`);

const [[cmpCount]] = await db.query('SELECT COUNT(*) AS c FROM candidates');
const [[teamsCount]] = await db.query('SELECT COUNT(*) AS c FROM teams');
const [[jCount]] = await db.query('SELECT COUNT(*) AS c FROM judges');
log('\nDone.');
log(`  total judges = ${jCount.c}  (expect 1 admin + 7 events x 4 = 29)`);
log(`  total teams  = ${teamsCount.c}  (expect 7 events x 4 = 28)`);
log(`  total candidates = ${cmpCount.c}`);

await db.end();



