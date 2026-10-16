// Weighted scoring engine.
// For every candidate:
//   segmentScore = sum( criteria_score avg over judges * criteria.weight / 100 )
//   finalScore   = sum( segmentScore * segment.final_weight / 100 )
import pool from '../db.js';

const TITLES = ['Mr./Ms. Isidran Intramurals', 'First Runner Up', 'Second Runner Up', 'Third Runner Up'];
const GENERIC_TITLES = ['Champion', 'First Runner Up', 'Second Runner Up', 'Third Runner Up'];

export async function computeResults(competitionId) {
  const [[competition]] = await pool.query('SELECT * FROM competitions WHERE id = ?', [competitionId]);
  if (!competition) throw new Error('Competition not found.');

  // Group competitions (e.g. Hiphop) rank everyone together — no Male/Female split.
  const isGroupComp = Number(competition.standalone) === 1;
  const GENDERS = isGroupComp ? ['Team'] : ['Male', 'Female'];

  const [candidates] = await pool.query(
    `SELECT c.*, t.name AS team_name, t.color AS team_color
     FROM candidates c
     LEFT JOIN teams t ON t.id = c.team_id
     WHERE c.competition_id = ?`,
    [competitionId]
  );
  candidates.forEach((c) => {
    c.photo_url = c.photo ? `/uploads/${encodeURIComponent(c.photo)}` : null;
  });
  // Per-exposure photos keyed by segment id: segment_photos = { [segmentId]: { photo, photo_url } }
  const [photoRows] = await pool.query(
    `SELECT cp.candidate_id, cp.segment_id, cp.photo
     FROM candidate_photos cp
     JOIN segments s ON s.id = cp.segment_id
     WHERE s.competition_id = ?`,
    [competitionId]
  );
  const segPhotoByCand = {};
  photoRows.forEach((r) => {
    (segPhotoByCand[r.candidate_id] ||= {})[String(r.segment_id)] = {
      photo: r.photo,
      photo_url: `/uploads/${encodeURIComponent(r.photo)}`,
    };
  });
  candidates.forEach((c) => { c.segment_photos = segPhotoByCand[c.id] || {}; });
  const [segments] = await pool.query('SELECT * FROM segments WHERE competition_id = ? ORDER BY sort_order ASC', [competitionId]);
  const [criterias] = await pool.query('SELECT * FROM criterias ORDER BY segment_id ASC, sort_order ASC');
  const [judgeRows] = await pool.query('SELECT id FROM judges WHERE is_admin = 0 AND competition_id = ?', [competitionId]);
  const [scoreRows] = await pool.query(
    `SELECT sc.candidate_id, sc.judge_id, sc.criteria_id, sc.score
     FROM scores sc
     JOIN criterias cr ON cr.id = sc.criteria_id
     JOIN segments s ON s.id = cr.segment_id
     WHERE s.competition_id = ?`,
    [competitionId]
  );

  const segById = {};
  const criteriaBySeg = {};
  segments.forEach((s) => {
    segById[s.id] = s;
    criteriaBySeg[s.id] = [];
  });
  criterias.forEach((c) => {
    if (criteriaBySeg[c.segment_id]) criteriaBySeg[c.segment_id].push(c);
  });

  const criteriaOfSegment = {};
  criterias.forEach((c) => { criteriaOfSegment[c.id] = c.segment_id; });

  // Group raw judge scores by (candidate, criteria).
  const groups = {};
  scoreRows.forEach((r) => {
    const key = `${r.candidate_id}|${r.criteria_id}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(Number(r.score));
  });

  // Per-candidate, per-segment raw criteria averages.
  const candidateSegments = {}; // candId -> { segmentCode: { criteriaId: avg } , pts: judgeCount }
  candidates.forEach((c) => {
    candidateSegments[c.id] = {};
    segments.forEach((s) => { candidateSegments[c.id][s.code] = { criteria: {}, judged: 0 }; });
  });

  candidates.forEach((c) => {
    for (const key of Object.keys(groups)) {
      const [cid, critId] = key.split('|').map(Number);
      if (cid !== c.id) continue;
      const segId = criteriaOfSegment[critId];
      const seg = segById[segId];
      if (!seg) continue;
      const avg = groups[key].reduce((a, b) => a + b, 0) / groups[key].length;
      candidateSegments[c.id][seg.code].criteria[critId] = avg;
      candidateSegments[c.id][seg.code].judged += 1;
    }
  });

  const finalByGender = {};
  const perGenderPerSegment = {};
  GENDERS.forEach((g) => { finalByGender[g] = []; perGenderPerSegment[g] = {}; });
  segments.forEach((s) => { GENDERS.forEach((g) => { perGenderPerSegment[g][s.code] = []; }); });

  candidates.forEach((c) => {
    const segScores = {};
    const detail = {};
    let finalScore = 0;
    let judgedCriteria = 0;
    const totalCriteria = segments.reduce((n, s) => n + criteriaBySeg[s.id].length, 0);

    segments.forEach((s) => {
      const info = candidateSegments[c.id][s.code];
      const crits = criteriaBySeg[s.id];
      let segSum = 0;
      crits.forEach((crit) => {
        const avg = info.criteria[crit.id];
        if (avg !== undefined) {
          judgedCriteria += 1;
          segSum += avg * (Number(crit.weight) / 100);
        }
      });
      const segScore = segSum;
      segScores[s.code] = Number(segScore.toFixed(2));
      detail[s.code] = {
        score: Number(segScore.toFixed(2)),
        explanation: crits.map((crit) => {
          const avg = info.criteria[crit.id];
          return { name: crit.name, weight: crit.weight, average: avg == null ? null : Number(avg.toFixed(2)) };
        }),
      };
      finalScore += segScore * (Number(s.final_weight) / 100);
    });

    const row = {
      candidate: c,
      segmentScores: segScores,
      detail,
      finalScore: Number(finalScore.toFixed(4)),
      judgedCriteria,
      totalCriteria,
      judged: candidateSegments[c.id][Object.keys(candidateSegments[c.id])[0]]?.judged ?? 0,
    };
    const bucket = isGroupComp ? 'Team' : c.gender;
    finalByGender[bucket].push(row);
    segments.forEach((s) => {
      perGenderPerSegment[bucket][s.code].push({
        candidate: c,
        score: segScores[s.code],
        finalScore,
      });
    });
  });

  // Rank overall (per gender for the pageant, single list for groups).
  const ranked = {};
  GENDERS.forEach((g) => { ranked[g] = rankRows(finalByGender[g]); });

  // Winner summary.
  const winners = {};
  GENDERS.forEach((g) => {
    const list = ranked[g];
    winners[g] = {
      champion: list[0] || null,
      firstRunnerUp: list[1] || null,
      secondRunnerUp: list[2] || null,
      thirdRunnerUp: list[3] || null,
    };
  });

  // Best per segment per group/gender (by that segment's score, tie-broken by overall rank).
  const bests = {};
  segments.forEach((s) => {
    bests[s.code] = {};
    GENDERS.forEach((g) => {
      const arr = perGenderPerSegment[g][s.code].slice();
      arr.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.finalScore - a.finalScore; // tie-break by overall
      });
      bests[s.code][g] = arr[0] ? { candidate: arr[0].candidate, score: arr[0].score } : null;
    });
  });

  // Team standings: aggregate the final scores of each team's members.
  const [teams] = await pool.query('SELECT * FROM teams WHERE competition_id = ? ORDER BY sort_order ASC, name ASC', [competitionId]);
  const teamAgg = {};
  teams.forEach((t) => {
    teamAgg[t.id] = { id: t.id, name: t.name, color: t.color, members: 0, total: 0, champions: 0 };
  });
  candidates.forEach((c) => {
    if (!c.team_id || !teamAgg[c.team_id]) return;
    teamAgg[c.team_id].members += 1;
  });
  // Attach per-member final scores (only active are ranked; use ranked lists).
  const teamByCand = {};
  candidates.forEach((c) => { teamByCand[c.id] = c.team_id; });
  GENDERS.forEach((g) => {
    ranked[g].forEach((r) => {
      const tid = teamByCand[r.candidate.id];
      if (tid && teamAgg[tid]) teamAgg[tid].total += r.finalScore;
    });
  });
  // Count individual champions per team.
  GENDERS.forEach((g) => {
    const w = winners[g];
    [w.champion, w.firstRunnerUp, w.secondRunnerUp, w.thirdRunnerUp].forEach((row) => {
      if (!row) return;
      const tid = row.candidate.team_id;
      if (tid && teamAgg[tid]) teamAgg[tid].champions += 1;
    });
  });
  const teamStandings = Object.values(teamAgg)
    .filter((t) => t.members > 0)
    .map((t) => ({ ...t, average: t.members ? Number((t.total / t.members).toFixed(4)) : 0, total: Number(t.total.toFixed(4)) }))
    .sort((a, b) => b.average - a.average || b.total - a.total || a.name.localeCompare(b.name));

  const titles = Number(competition.standalone) === 1
    ? GENERIC_TITLES
    : TITLES.map((t) => (t.includes('First') ? `${competition.name} ${t}` : t));

  return {
    competition: { id: competition.id, code: competition.code, name: competition.name, standalone: Number(competition.standalone) },
    segments,
    criterias,
    judgeCount: judgeRows.length,
    candidates,
    ranked,
    winners,
    bests,
    teams: teams.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    teamStandings,
    titles,
  };
}

function rankRows(rows) {
  return rows
    .slice()
    .sort((a, b) => {
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      // tie-break: number of judged criteria desc, then candidate_no asc
      if (b.criteria !== a.criteria) return b.criteria - a.criteria;
      return a.candidate.candidate_no.localeCompare(b.candidate.candidate_no);
    });
}