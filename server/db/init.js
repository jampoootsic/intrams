import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true,
};

const DB = process.env.DB_NAME || 'intramsgrado_db';

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

async function main() {
  // Bootstrap connection without a database selected.
  const conn = await mysql.createConnection({ ...BASE, database: undefined });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.changeUser({ database: DB });

  const schemaSql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  await conn.query(schemaSql);

  // --- Migrations for databases created before a column/table existed. ---
  // Add the photo column to candidates if the table was created before this feature.
  try {
    const [[col]] = await conn.query(
      "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'candidates' AND COLUMN_NAME = 'photo'",
      [DB]
    );
    if (Number(col.c) === 0) {
      await conn.query('ALTER TABLE candidates ADD COLUMN photo VARCHAR(255) NULL AFTER gender');
      console.log('Migration: added candidates.photo column.');
    }
  } catch (e) {
    console.warn('Migration check for candidates.photo skipped:', e.message);
  }

  // Add the team_id column to candidates and team FK if created before this feature.
  try {
    const [[col]] = await conn.query(
      "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'candidates' AND COLUMN_NAME = 'team_id'",
      [DB]
    );
    if (Number(col.c) === 0) {
      await conn.query('ALTER TABLE candidates ADD COLUMN team_id INT NULL AFTER photo');
      await conn.query('ALTER TABLE candidates ADD CONSTRAINT fk_cand_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL');
      console.log('Migration: added candidates.team_id column.');
    }
  } catch (e) {
    console.warn('Migration check for candidates.team_id skipped:', e.message);
  }

  // Create the settings table if the database predates the feature, and ensure
  // the default "scoring unlocked" row exists. (The API also self-heals this.)
  try {
    const [[tbl]] = await conn.query(
      "SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'settings'",
      [DB]
    );
    if (Number(tbl.c) === 0) {
      await conn.query(`CREATE TABLE settings (
        setting_key VARCHAR(50) PRIMARY KEY,
        setting_value VARCHAR(255) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      console.log('Migration: created settings table.');
    }
    await conn.query(
      "INSERT IGNORE INTO settings (setting_key, setting_value) VALUES ('scoring_locked', '0')"
    );
  } catch (e) {
    console.warn('Migration check for settings table skipped:', e.message);
  }

  // Seed segments + criterias. Segments reference competitions, so the Mr. & Ms.
  // competition must exist first (the competitions block below is idempotent).
  const [[segCount]] = await conn.query('SELECT COUNT(*) AS c FROM segments');
  if (Number(segCount.c) === 0) {
    let [[mrSeed]] = await conn.query("SELECT id FROM competitions WHERE code = 'mr-ms' LIMIT 1");
    if (!mrSeed) {
      const [res] = await conn.query(
        "INSERT INTO competitions (code, name, standalone, unit_type, sort_order) VALUES ('mr-ms', 'Mr. & Ms. Isidran Intramurals', 0, 'individual', 1)"
      );
      mrSeed = { id: res.insertId };
      console.log('Created Mr. & Ms. competition.');
    }
    let order = 1;
    for (const seg of SEGMENTS) {
      const [res] = await conn.query(
        'INSERT INTO segments (code, competition_id, name, final_weight, sort_order) VALUES (?, ?, ?, ?, ?)',
        [seg.code, mrSeed.id, seg.name, seg.final_weight, order]
      );
      const segmentId = res.insertId;
      let cOrder = 1;
      for (const [name, weight] of seg.criteria) {
        await conn.query(
          'INSERT INTO criterias (segment_id, name, weight, sort_order) VALUES (?, ?, ?, ?)',
          [segmentId, name, weight, cOrder++]
        );
      }
      order += 1;
    }
    console.log('Seeded segments & criteria.');
  } else {
    console.log('Segments already present, skipping seed.');
  }

  // ---- Admin judge.
  const [[admin]] = await conn.query("SELECT id FROM judges WHERE username = 'admin'");
  if (!admin) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
    await conn.query(
      "INSERT INTO judges (name, username, password, is_admin) VALUES (?, ?, ?, 1)",
      ['Administrator', 'admin', hash]
    );
    console.log('Created admin user (username: admin, password: admin123 by default).');
  } else {
    console.log('Admin user already exists.');
  }
const state = {};
  // ---- Competitions (Mr. & Ms. / Hiphop / Solo). ----
  try {
    const [[tbl]] = await conn.query(
      "SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'competitions'",
      [DB]
    );
    if (Number(tbl.c) === 0) {
      await conn.query(
        'CREATE TABLE competitions (id INT AUTO_INCREMENT PRIMARY KEY, code VARCHAR(30) NOT NULL UNIQUE, name VARCHAR(100) NOT NULL, standalone TINYINT(1) NOT NULL DEFAULT 0, unit_type ENUM(\'individual\', \'group\') NOT NULL DEFAULT \'individual\', sort_order INT NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
      );
      console.log('Migration: created competitions table.');
    } else {
      // Add unit_type for databases that predate the column (group = hiphop-style entries).
      const [[utCol]] = await conn.query(
        "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'competitions' AND COLUMN_NAME = 'unit_type'",
        [DB]
      );
      if (Number(utCol.c) === 0) {
        await conn.query("ALTER TABLE competitions ADD COLUMN unit_type ENUM('individual', 'group') NOT NULL DEFAULT 'individual' AFTER standalone");
        console.log('Migration: added competitions.unit_type column.');
      }
    }

    let mrId = null, hipId = null, soloId = null;
    const [[mrRow]] = await conn.query("SELECT id FROM competitions WHERE code = 'mr-ms' LIMIT 1");
    if (!mrRow) {
      const [res] = await conn.query(
        "INSERT INTO competitions (code, name, standalone, unit_type, sort_order) VALUES ('mr-ms', 'Mr. & Ms. Isidran Intramurals', 0, 'individual', 1)"
      );
      mrId = res.insertId;
      console.log('Migration: created Mr. & Ms. competition.');
    } else { mrId = mrRow.id; }

    const [[hipRow]] = await conn.query("SELECT id FROM competitions WHERE code = 'hiphop' LIMIT 1");
    if (!hipRow) {
      const [res] = await conn.query(
        "INSERT INTO competitions (code, name, standalone, unit_type, sort_order) VALUES ('hiphop', 'Hiphop Dance Competition', 1, 'group', 2)"
      );
      hipId = res.insertId;
      console.log('Migration: created Hiphop competition.');
    } else { hipId = hipRow.id; }

    const [[soloRow]] = await conn.query("SELECT id FROM competitions WHERE code = 'solo' LIMIT 1");
    if (!soloRow) {
      const [res] = await conn.query(
        "INSERT INTO competitions (code, name, standalone, unit_type, sort_order) VALUES ('solo', 'Solo Singing Contest', 1, 'individual', 3)"
      );
      soloId = res.insertId;
      console.log('Migration: created Solo Singing competition.');
    } else { soloId = soloRow.id; }

    let duetId = null;
    const [[duetRow]] = await conn.query("SELECT id FROM competitions WHERE code = 'vocal-duet' LIMIT 1");
    if (!duetRow) {
      const [res] = await conn.query(
        "INSERT INTO competitions (code, name, standalone, unit_type, sort_order) VALUES ('vocal-duet', 'Vocal Duet', 1, 'individual', 4)"
      );
      duetId = res.insertId;
      console.log('Migration: created Vocal Duet competition.');
    } else { duetId = duetRow.id; }

    let bandsId = null;
    const [[bandsRow]] = await conn.query("SELECT id FROM competitions WHERE code = 'bands' LIMIT 1");
    if (!bandsRow) {
      const [res] = await conn.query(
        "INSERT INTO competitions (code, name, standalone, unit_type, sort_order) VALUES ('bands', 'Battle of the Bands', 1, 'group', 5)"
      );
      bandsId = res.insertId;
      console.log('Migration: created Battle of the Bands competition.');
    } else { bandsId = bandsRow.id; }

    let speechId = null;
    const [[speechRow]] = await conn.query("SELECT id FROM competitions WHERE code = 'speech' LIMIT 1");
    if (!speechRow) {
      const [res] = await conn.query(
        "INSERT INTO competitions (code, name, standalone, unit_type, sort_order) VALUES ('speech', 'Extemporaneous Speech', 1, 'individual', 6)"
      );
      speechId = res.insertId;
      console.log('Migration: created Extemporaneous Speech competition.');
    } else { speechId = speechRow.id; }

    let oratoricalId = null;
    const [[oratRow]] = await conn.query("SELECT id FROM competitions WHERE code = 'oratorical' LIMIT 1");
    if (!oratRow) {
      const [res] = await conn.query(
        "INSERT INTO competitions (code, name, standalone, unit_type, sort_order) VALUES ('oratorical', 'Oratorical Speech', 1, 'individual', 7)"
      );
      oratoricalId = res.insertId;
      console.log('Migration: created Oratorical Speech competition.');
    } else { oratoricalId = oratRow.id; }

    // Correct the unit types.
    await conn.query("UPDATE competitions SET standalone = 0, unit_type = 'individual' WHERE id = ?", [mrId]);
    await conn.query("UPDATE competitions SET standalone = 1, unit_type = 'group' WHERE id = ?", [hipId]);
    await conn.query("UPDATE competitions SET standalone = 1, unit_type = 'individual' WHERE id = ?", [soloId]);
    await conn.query("UPDATE competitions SET standalone = 1, unit_type = 'individual' WHERE id = ?", [duetId]);
    await conn.query("UPDATE competitions SET standalone = 1, unit_type = 'group' WHERE id = ?", [bandsId]);
    await conn.query("UPDATE competitions SET standalone = 1, unit_type = 'individual' WHERE id = ?", [speechId]);
    await conn.query("UPDATE competitions SET standalone = 1, unit_type = 'individual' WHERE id = ?", [oratoricalId]);

    // Criteria names may carry long descriptions — widen the column if needed.
    await conn.query('ALTER TABLE criterias MODIFY COLUMN name VARCHAR(255) NOT NULL');

    // Keep identifiers for the next steps.
    state.competitionMr = mrId;
    state.competitionHiphop = hipId;
    state.competitionSolo = soloId;
    state.competitionDuet = duetId;
    state.competitionBands = bandsId;
    state.competitionSpeech = speechId;
    state.competitionOratorical = oratoricalId;
  } catch (e) {
    console.warn('Migration check for competitions skipped:', e.message);
  }

  // ---- Segments: add competition_id and link them to the right competition. ----
  try {
    const [[col]] = await conn.query(
      "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'segments' AND COLUMN_NAME = 'competition_id'",
      [DB]
    );
    if (Number(col.c) === 0) {
      await conn.query('ALTER TABLE segments ADD COLUMN competition_id INT NOT NULL DEFAULT 1 AFTER code');
      try {
        await conn.query('ALTER TABLE segments ADD CONSTRAINT fk_seg_competition FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE');
      } catch (e2) {
        console.warn('Could not add segments.competition_id FK (may already exist):', e2.message);
      }
      console.log('Migration: added segments.competition_id column.');
    }
    await conn.query(
      "UPDATE segments SET competition_id = ? WHERE code IN ('jeans','sports','cultural','formal','talent','qa')",
      [state.competitionMr]
    );
    await conn.query("UPDATE segments SET competition_id = ? WHERE code IN ('hiphop','solo')", [state.competitionHiphop]);
    await conn.query("UPDATE segments SET competition_id = ? WHERE code = 'solo'", [state.competitionSolo]);
    await conn.query("UPDATE segments SET competition_id = ? WHERE code = 'vocal-duet'", [state.competitionDuet]);
    await conn.query("UPDATE segments SET competition_id = ? WHERE code = 'bands'", [state.competitionBands]);
    await conn.query("UPDATE segments SET competition_id = ? WHERE code = 'speech'", [state.competitionSpeech]);
    await conn.query("UPDATE segments SET competition_id = ? WHERE code = 'oratorical'", [state.competitionOratorical]);
    console.log('Migration: linked segments to competitions.');
  } catch (e) {
    console.warn('Migration check for segment/competition links skipped:', e.message);
  }

  // ---- Ensure every standalone competition has its scoring segment(s). ----
  const STANDALONE_SEGMENTS = [
    {
      compCode: 'hiphop', segCode: 'hiphop', name: 'Hiphop Dance Competition', criteria: [
        ['Choreography (Creativity, Artistry and Style Execution)', 40],
        ['Execution (Timing and Coordination, Projection and Expression)', 40],
        ['Costume and Props', 20],
      ],
    },
    {
      compCode: 'solo', segCode: 'solo', name: 'Solo Singing Contest', criteria: [
        ['Tone Quality', 40],
        ['Interpretation/Delivery/Dynamics', 40],
        ['Stage Presence (Deportment/Bearing/Discipline)', 20],
      ],
    },
    {
      compCode: 'vocal-duet', segCode: 'vocal-duet', name: 'Vocal Duet', criteria: [
        ['Tone Quality', 40],
        ['Interpretation/Delivery/Dynamics', 40],
        ['Stage Presence (Deportment/Bearing/Discipline)', 20],
      ],
    },
    {
      compCode: 'bands', segCode: 'bands', name: 'Battle of the Bands', criteria: [
        ['Planning/Preparedness (Instruments and equipment made ready prior to performance, appeared ready and prepared to play and conformed to contest rules)', 30],
        ['Quality of Performance (Mastery of performance piece, on stage attitude appear suitable to the contest piece/genre, confident and enjoy what they are doing)', 50],
        ['Interface with Audience (Entire band interact and display showmanship towards the crowd)', 20],
      ],
    },
    {
      compCode: 'speech', segCode: 'speech', name: 'Extemporaneous Speech', criteria: [
        ['Content', 40],
        ['Delivery', 20],
        ['Pronunciation, Enunciation, and Diction', 20],
        ['Stage Presence (Eye Contact, Poise, Personality)', 20],
      ],
    },
    {
      compCode: 'oratorical', segCode: 'oratorical', name: 'Oratorical Speech', criteria: [
        ['Vocal Delivery', 30],
        ['Emotional Delivery', 30],
        ['Physical Delivery', 20],
        ['Accuracy', 20],
      ],
    },
  ];
  for (const item of STANDALONE_SEGMENTS) {
    try {
      const [[comp]] = await conn.query('SELECT id FROM competitions WHERE code = ? LIMIT 1', [item.compCode]);
      if (!comp) continue;
      const [[seg]] = await conn.query('SELECT id FROM segments WHERE code = ? LIMIT 1', [item.segCode]);
      if (!seg) {
        const [[mx]] = await conn.query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM segments');
        const [res] = await conn.query(
          'INSERT INTO segments (code, competition_id, name, final_weight, sort_order) VALUES (?, ?, ?, 0, ?)',
          [item.segCode, comp.id, item.name, mx.n]
        );
        const segId = res.insertId;
        let cOrder = 1;
        for (const [cname, weight] of item.criteria) {
          await conn.query(
            'INSERT INTO criterias (segment_id, name, weight, sort_order) VALUES (?, ?, ?, ?)',
            [segId, cname, weight, cOrder++]
          );
        }
        console.log(`Migration: seeded ${item.name} segment + criteria.`);
      }
      await conn.query('UPDATE segments SET competition_id = ? WHERE code = ?', [comp.id, item.segCode]);
    } catch (e) {
      console.warn(`Migration check for ${item.segCode} segment skipped:`, e.message);
    }
  }
  // ---- Judges: attach the competition they belong to. ----
  try {
    const [[jcol]] = await conn.query(
      "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'judges' AND COLUMN_NAME = 'competition_id'",
      [DB]
    );
    if (Number(jcol.c) === 0) {
      await conn.query('ALTER TABLE judges ADD COLUMN competition_id INT NULL AFTER is_admin');
      try {
        await conn.query('ALTER TABLE judges ADD CONSTRAINT fk_judge_competition FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE SET NULL');
      } catch (e2) {
        console.warn('Could not add judges.competition_id FK (may already exist):', e2.message);
      }
      console.log('Migration: added judges.competition_id column.');
    }

    // Admins are system-wide.
    await conn.query('UPDATE judges SET competition_id = NULL WHERE is_admin = 1');

    // If upgrading from the old judge_segments model, derive each judge's
    // competition from the segments they were assigned to.
    const [[jsExist]] = await conn.query(
      "SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'judge_segments'",
      [DB]
    );
    if (Number(jsExist.c) > 0) {
      await conn.query(
        `UPDATE judges j
         SET competition_id = CASE
           WHEN EXISTS (SELECT 1 FROM judge_segments js JOIN segments s ON s.id = js.segment_id
                        WHERE js.judge_id = j.id AND s.code = 'hiphop')
                THEN ? ELSE ? END
         WHERE j.is_admin = 0 AND j.competition_id IS NULL`,
        [state.competitionHiphop, state.competitionMr]
      );
    }

    // Any remaining non-admin judges default to the Mr. & Ms. competition.
    await conn.query(
      'UPDATE judges SET competition_id = ? WHERE is_admin = 0 AND competition_id IS NULL',
      [state.competitionMr]
    );
    console.log('Migration: attached judges to competitions.');
  } catch (e) {
    console.warn('Migration check for judge competitions skipped:', e.message);
  }

  // ---- Candidates & teams: competition scoping columns. ----
  try {
    const [[ccol]] = await conn.query(
      "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'candidates' AND COLUMN_NAME = 'competition_id'",
      [DB]
    );
    if (Number(ccol.c) === 0) {
      await conn.query('ALTER TABLE candidates ADD COLUMN competition_id INT NOT NULL DEFAULT 1 AFTER id');
      try {
        await conn.query('ALTER TABLE candidates ADD CONSTRAINT fk_cand_competition FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE');
      } catch (e2) {
        console.warn('Could not add candidates.competition_id FK (may already exist):', e2.message);
      }
      console.log('Migration: added candidates.competition_id column.');
    }
    const [[tcol]] = await conn.query(
      "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'teams' AND COLUMN_NAME = 'competition_id'",
      [DB]
    );
    if (Number(tcol.c) === 0) {
      await conn.query('ALTER TABLE teams ADD COLUMN competition_id INT NOT NULL DEFAULT 1 AFTER id');
      try {
        await conn.query('ALTER TABLE teams ADD CONSTRAINT fk_team_competition FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE');
      } catch (e2) {
        console.warn('Could not add teams.competition_id FK (may already exist):', e2.message);
      }
      // Team names only need to be unique within their own competition.
      try {
        await conn.query('ALTER TABLE teams DROP INDEX name');
      } catch (e3) {
        console.warn('Could not drop old teams.name unique key:', e3.message);
      }
      try {
        await conn.query('ALTER TABLE teams ADD UNIQUE KEY uq_team_name_competition (competition_id, name)');
      } catch (e3) {
        console.warn('Could not add unique key (competition_id, name):', e3.message);
      }
      console.log('Migration: added teams.competition_id column.');
    }
    // Existing rows (pre-scoping) belong to the Mr. & Ms. competition.
    await conn.query('UPDATE candidates SET competition_id = ? WHERE competition_id IS NULL OR competition_id = 0', [state.competitionMr]);
    await conn.query('UPDATE teams SET competition_id = ? WHERE competition_id IS NULL OR competition_id = 0', [state.competitionMr]);

    // Group entries (standalone competitions like Hiphop): a group has no
    // gender and is identified by group_name instead of first/last name.
    const [[gnCol]] = await conn.query(
      "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'candidates' AND COLUMN_NAME = 'group_name'",
      [DB]
    );
    if (Number(gnCol.c) === 0) {
      await conn.query('ALTER TABLE candidates ADD COLUMN group_name VARCHAR(100) NULL AFTER last_name');
      console.log('Migration: added candidates.group_name column.');
    }
    await conn.query("ALTER TABLE candidates MODIFY COLUMN gender ENUM('Male', 'Female') NULL");
    await conn.query('ALTER TABLE candidates MODIFY COLUMN first_name VARCHAR(100) NULL');
    await conn.query('ALTER TABLE candidates MODIFY COLUMN last_name VARCHAR(100) NULL');
  } catch (e) {
    console.warn('Migration check for candidate/team competitions skipped:', e.message);
  }

  // ---- Standalone-competition judges (hiphop + solo). ----
  const STANDALONE_JUDGES = [
    {
      competitionId: state.competitionHiphop,
      judges: [
        { name: 'Judge3', username: 'judge3', password: 'judge3' },
        { name: 'Judge4', username: 'judge4', password: 'judge4' },
      ],
    },
    {
      competitionId: state.competitionSolo,
      judges: [
        { name: 'Judge5', username: 'judge5', password: 'judge5' },
        { name: 'Judge6', username: 'judge6', password: 'judge6' },
      ],
    },
    {
      competitionId: state.competitionDuet,
      judges: [
        { name: 'Judge7', username: 'judge7', password: 'judge7' },
        { name: 'Judge8', username: 'judge8', password: 'judge8' },
      ],
    },
    {
      competitionId: state.competitionBands,
      judges: [
        { name: 'Judge9', username: 'judge9', password: 'judge9' },
        { name: 'Judge10', username: 'judge10', password: 'judge10' },
      ],
    },
    {
      competitionId: state.competitionSpeech,
      judges: [
        { name: 'Judge11', username: 'judge11', password: 'judge11' },
        { name: 'Judge12', username: 'judge12', password: 'judge12' },
      ],
    },
    {
      competitionId: state.competitionOratorical,
      judges: [
        { name: 'Judge13', username: 'judge13', password: 'judge13' },
        { name: 'Judge14', username: 'judge14', password: 'judge14' },
      ],
    },
  ];
  for (const group of STANDALONE_JUDGES) {
    for (const j of group.judges) {
      try {
        const [[row]] = await conn.query('SELECT id FROM judges WHERE username = ? LIMIT 1', [j.username]);
        let judgeId = row ? row.id : null;
        if (!judgeId) {
          const hash = bcrypt.hashSync(j.password, 10);
          const [res] = await conn.query(
            'INSERT INTO judges (name, username, password, is_admin, competition_id) VALUES (?, ?, ?, 0, ?)',
            [j.name, j.username, hash, group.competitionId]
          );
          judgeId = res.insertId;
          console.log(`Migration: created ${j.name} (username: ${j.username}).`);
        } else {
          await conn.query('UPDATE judges SET competition_id = ? WHERE id = ?', [group.competitionId, judgeId]);
        }
      } catch (e) {
        console.warn(`Migration check for ${j.username} skipped:`, e.message);
      }
    }
  }

  // ---- Cleanup of the interim events/judge_segments model (if upgrading). ----
  try {
    const [[oldCol]] = await conn.query(
      "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'segments' AND COLUMN_NAME = 'event_id'",
      [DB]
    );
    if (Number(oldCol.c) > 0) {
      // Remove the FK first, then the column, then the orphaned events table.
      try { await conn.query('ALTER TABLE segments DROP FOREIGN KEY fk_seg_event'); } catch { /* no FK by that name */ }
      try { await conn.query('ALTER TABLE segments DROP COLUMN event_id'); } catch (e2) { console.warn('Could not drop segments.event_id:', e2.message); }
    }
    await conn.query('DROP TABLE IF EXISTS events');
    await conn.query('DROP TABLE IF EXISTS judge_segments');
    console.log('Migration: dropped interim judge_segments / events tables.');
  } catch (e) {
    console.warn('Migration cleanup skipped:', e.message);
  }

  await conn.end();
  console.log('Database ready:', DB);
}

main().catch((err) => {
  console.error('Initialization failed:', err.message);
  process.exit(1);
});