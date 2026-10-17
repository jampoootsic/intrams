import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import bcrypt from 'bcryptjs';
import db from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const COMPETITIONS = [
  { code: 'mr-ms',      name: 'Mr. & Ms. Isidran Intramurals', standalone: 0, unit_type: 'individual', sort_order: 1 },
  { code: 'hiphop',     name: 'Hiphop Dance Competition',      standalone: 1, unit_type: 'group',      sort_order: 2 },
  { code: 'solo',       name: 'Solo Singing Contest',          standalone: 1, unit_type: 'individual', sort_order: 3 },
  { code: 'vocal-duet', name: 'Vocal Duet',                    standalone: 1, unit_type: 'individual', sort_order: 4 },
  { code: 'bands',      name: 'Battle of the Bands',           standalone: 1, unit_type: 'group',      sort_order: 5 },
  { code: 'speech',     name: 'Extemporaneous Speech',         standalone: 1, unit_type: 'individual', sort_order: 6 },
  { code: 'oratorical', name: 'Oratorical Speech',             standalone: 1, unit_type: 'individual', sort_order: 7 },
];

// Default segments & criteria per the contest format.
const SEGMENTS = [
  { code: 'jeans',   name: 'Best in Jeans Attire',  final_weight: 15, criteria: [
      ['Bearing, Appearance and Physique', 40],
      ['Personality and Countenance', 30],
      ['Projection and Stage Presence', 20],
      ['Appeal to the Audience', 10],
    ] },
  { code: 'sports', name: 'Best in Sports Attire',  final_weight: 15, criteria: [
      ['Bearing, Appearance and Physique', 40],
      ['Personality and Countenance', 30],
      ['Projection and Stage Presence', 20],
      ['Appeal to the Audience', 10],
    ] },
  { code: 'cultural', name: 'Best in Cultural Attire', final_weight: 15, criteria: [
      ['Bearing, Appearance and Physique', 40],
      ['Personality and Countenance', 30],
      ['Projection and Stage Presence', 20],
      ['Appeal to the Audience', 10],
    ] },
  { code: 'formal', name: 'Best in Formal Attire', final_weight: 15, criteria: [
      ['Bearing, Appearance and Physique', 40],
      ['Personality and Countenance', 30],
      ['Projection and Stage Presence', 20],
      ['Appeal to the Audience', 10],
    ] },
  { code: 'talent', name: 'Talent Presentation', final_weight: 15, criteria: [
      ['Mastery', 40],
      ['Creativity and Originality', 30],
      ['Projection and Stage Presence', 20],
      ['Audience Impact', 10],
    ] },
  { code: 'qa', name: 'Question and Answer', final_weight: 25, criteria: [
      ['Substance and Appropriateness of Answer', 40],
      ['Organization of Ideas', 30],
      ['English Language Fluency', 30],
    ] },
  // Standalone event — separate judges, NOT part of the Mr./Ms. finals (final_weight 0).
  { code: 'hiphop', name: 'Hiphop Dance Competition', final_weight: 0, criteria: [
      ['Choreography (Creativity, Artistry and Style Execution)', 40],
      ['Execution (Timing and Coordination, Projection and Expression)', 40],
      ['Costume and Props', 20],
    ] },
  // Another standalone event — solo singers, judged as individual contestants.
  { code: 'solo', name: 'Solo Singing Contest', final_weight: 0, criteria: [
      ['Tone Quality', 40],
      ['Interpretation/Delivery/Dynamics', 40],
      ['Stage Presence (Deportment/Bearing/Discipline)', 20],
    ] },
  // Vocal Duet — same structure as Solo (individual entries, combined ranking).
  { code: 'vocal-duet', name: 'Vocal Duet', final_weight: 0, criteria: [
      ['Tone Quality', 40],
      ['Interpretation/Delivery/Dynamics', 40],
      ['Stage Presence (Deportment/Bearing/Discipline)', 20],
    ] },
  // Battle of the Bands — a band is a group unit (like Hiphop): band name + team.
  { code: 'bands', name: 'Battle of the Bands', final_weight: 0, criteria: [
      ['Planning/Preparedness (Instruments and equipment made ready prior to performance, appeared ready and prepared to play and conformed to contest rules)', 30],
      ['Quality of Performance (Mastery of performance piece, on stage attitude appear suitable to the contest piece/genre, confident and enjoy what they are doing)', 50],
      ['Interface with Audience (Entire band interact and display showmanship towards the crowd)', 20],
    ] },
  // Extemporaneous Speech — individual speakers, combined ranking (like Solo).
  { code: 'speech', name: 'Extemporaneous Speech', final_weight: 0, criteria: [
      ['Content', 40],
      ['Delivery', 20],
      ['Pronunciation, Enunciation, and Diction', 20],
      ['Stage Presence (Eye Contact, Poise, Personality)', 20],
    ] },
  // Oratorical Speech — individual orators, combined ranking (like Solo).
  { code: 'oratorical', name: 'Oratorical Speech', final_weight: 0, criteria: [
      ['Vocal Delivery', 30],
      ['Emotional Delivery', 30],
      ['Physical Delivery', 20],
      ['Accuracy', 20],
    ] },
];

// Segments belonging to Mr. & Ms.; every other segment belongs to the competition with the same code.
const MR_MS_SEGMENT_CODES = new Set(['jeans', 'sports', 'cultural', 'formal', 'talent', 'qa']);

// Per-competition judges (password = username).
const STANDALONE_JUDGES = [
  { compCode: 'mr-ms', judges: [
      { name: 'Judge1', username: 'judge1', password: 'judge1' },
      { name: 'Judge2', username: 'judge2', password: 'judge2' },
    ] },
  { compCode: 'hiphop', judges: [
      { name: 'Judge3', username: 'judge3', password: 'judge3' },
      { name: 'Judge4', username: 'judge4', password: 'judge4' },
    ] },
  { compCode: 'solo', judges: [
      { name: 'Judge5', username: 'judge5', password: 'judge5' },
      { name: 'Judge6', username: 'judge6', password: 'judge6' },
    ] },
  { compCode: 'vocal-duet', judges: [
      { name: 'Judge7', username: 'judge7', password: 'judge7' },
      { name: 'Judge8', username: 'judge8', password: 'judge8' },
    ] },
  { compCode: 'bands', judges: [
      { name: 'Judge9', username: 'judge9', password: 'judge9' },
      { name: 'Judge10', username: 'judge10', password: 'judge10' },
    ] },
  { compCode: 'speech', judges: [
      { name: 'Judge11', username: 'judge11', password: 'judge11' },
      { name: 'Judge12', username: 'judge12', password: 'judge12' },
    ] },
  { compCode: 'oratorical', judges: [
      { name: 'Judge13', username: 'judge13', password: 'judge13' },
      { name: 'Judge14', username: 'judge14', password: 'judge14' },
    ] },
];

async function main() {
  await db.query(readFileSync(join(__dirname, 'schema.sql'), 'utf8'));

  // ---- Competitions ----
  const compIds = {};
  for (const c of COMPETITIONS) {
    const [[row]] = await db.query('SELECT id FROM competitions WHERE code = ? LIMIT 1', [c.code]);
    if (row) {
      compIds[c.code] = row.id;
      continue;
    }
    const [[ins]] = await db.query(
      'INSERT INTO competitions (code, name, standalone, unit_type, sort_order) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [c.code, c.name, c.standalone, c.unit_type, c.sort_order]
    );
    compIds[c.code] = ins.id;
    console.log(`Created competition: ${c.name}`);
  }

  // ---- Segments + criteria ----
  let order = 0;
  for (const seg of SEGMENTS) {
    order += 1;
    const [[existing]] = await db.query('SELECT id FROM segments WHERE code = ? LIMIT 1', [seg.code]);
    if (existing) continue;
    const compId = compIds[MR_MS_SEGMENT_CODES.has(seg.code) ? 'mr-ms' : seg.code];
    const [[ins]] = await db.query(
      'INSERT INTO segments (code, competition_id, name, final_weight, sort_order) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [seg.code, compId, seg.name, seg.final_weight, order]
    );
    let cOrder = 1;
    for (const [name, weight] of seg.criteria) {
      await db.query(
        'INSERT INTO criterias (segment_id, name, weight, sort_order) VALUES (?, ?, ?, ?)',
        [ins.id, name, weight, cOrder++]
      );
    }
    console.log(`Created segment + criteria: ${seg.name}`);
  }

  // ---- Admin judge ----
  const [[admin]] = await db.query("SELECT id FROM judges WHERE username = 'admin' LIMIT 1");
  if (!admin) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
    await db.query(
      'INSERT INTO judges (name, username, password, is_admin) VALUES (?, ?, ?, 1)',
      ['Administrator', 'admin', hash]
    );
    console.log('Created admin user (username: admin).');
  }

  // ---- Standalone-competition judges ----
  for (const group of STANDALONE_JUDGES) {
    for (const j of group.judges) {
      const [[row]] = await db.query('SELECT id FROM judges WHERE username = ? LIMIT 1', [j.username]);
      if (row) continue;
      await db.query(
        'INSERT INTO judges (name, username, password, is_admin, competition_id) VALUES (?, ?, ?, 0, ?)',
        [j.name, j.username, bcrypt.hashSync(j.password, 10), compIds[group.compCode]]
      );
      console.log(`Created ${j.name} (username: ${j.username}).`);
    }
  }

  // ---- Settings (also seeded by schema.sql; kept explicit and idempotent) ----
  await db.query(
    "INSERT INTO settings (setting_key, setting_value) VALUES ('scoring_locked', '0'), ('data_version', '0') ON CONFLICT DO NOTHING"
  );

  console.log('Database ready.');
}

try {
  await main();
  await db.end();
} catch (err) {
  console.error('Initialization failed:', err.message);
  await db.end().catch(() => {});
  process.exit(1);
}
