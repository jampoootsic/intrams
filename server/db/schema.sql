-- San Isidro College Events Scoring System schema (Postgres)
-- Run via: node server/db/init.js  (idempotent)

CREATE TABLE IF NOT EXISTS competitions (
  id SERIAL PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  standalone SMALLINT NOT NULL DEFAULT 0,
  unit_type VARCHAR(20) NOT NULL DEFAULT 'individual' CHECK (unit_type IN ('individual','group')),
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS judges (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  is_admin SMALLINT NOT NULL DEFAULT 0,
  competition_id INT NULL REFERENCES competitions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  competition_id INT NOT NULL DEFAULT 1 REFERENCES competitions(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(20) NOT NULL DEFAULT '#14213d',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_team_name_competition UNIQUE (competition_id, name)
);

CREATE TABLE IF NOT EXISTS candidates (
  id SERIAL PRIMARY KEY,
  competition_id INT NOT NULL DEFAULT 1 REFERENCES competitions(id) ON DELETE CASCADE,
  candidate_no VARCHAR(10) NOT NULL,
  first_name VARCHAR(100) NULL,
  last_name VARCHAR(100) NULL,
  gender VARCHAR(20) NULL CHECK (gender IN ('Male','Female')),
  group_name VARCHAR(100) NULL,
  photo VARCHAR(512) NULL,
  team_id INT NULL REFERENCES teams(id) ON DELETE SET NULL,
  active SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS segments (
  id SERIAL PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  competition_id INT NOT NULL DEFAULT 1 REFERENCES competitions(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  final_weight NUMERIC(5,2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS criterias (
  id SERIAL PRIMARY KEY,
  segment_id INT NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  weight NUMERIC(5,2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS candidate_photos (
  id SERIAL PRIMARY KEY,
  candidate_id INT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  segment_id INT NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  photo VARCHAR(512) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_candidate_photo_segment UNIQUE (candidate_id, segment_id)
);

-- System-wide settings (key/value): admin "scoring lock" and the realtime change token.
CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(50) PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL
);
INSERT INTO settings (setting_key, setting_value) VALUES ('scoring_locked', '0') ON CONFLICT DO NOTHING;
INSERT INTO settings (setting_key, setting_value) VALUES ('data_version', '0') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS scores (
  id SERIAL PRIMARY KEY,
  candidate_id INT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  judge_id INT NOT NULL REFERENCES judges(id) ON DELETE CASCADE,
  criteria_id INT NOT NULL REFERENCES criterias(id) ON DELETE CASCADE,
  score NUMERIC(5,2) NOT NULL,
  CONSTRAINT uq_score UNIQUE (candidate_id, judge_id, criteria_id)
);
