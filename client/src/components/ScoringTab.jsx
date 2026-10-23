import { useEffect, useMemo, useRef, useState } from 'react';
import { segmentsApi, candidates, auth, scoresApi, teams as teamsApi, settingsApi } from '../api.js';
import { useLiveRefresh } from '../hooks/useLiveRefresh.js';

const GENDERS = ['All', 'Male', 'Female'];

export default function ScoringTab({ user, competition }) {
  const [segments, setSegments] = useState([]);
  const [judges, setJudges] = useState([]);
  const [candList, setCandList] = useState([]);
  const [teamList, setTeamList] = useState([]);
  const [segId, setSegId] = useState(null);
  const [activeJudge, setActiveJudge] = useState(null); // for admins: the judge to score as
  const [filter, setFilter] = useState('All');
  const [teamFilter, setTeamFilter] = useState('All');
  const [scores, setScores] = useState({}); // key = `${candId}:${critId}` -> string
  const [status, setStatus] = useState({}); // key -> 'saving'|'saved'|'error'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [locked, setLocked] = useState(false); // system-wide scoring lock
  const timers = useRef({});
  const inflight = useRef(new Set()); // keys with a save request in flight
  const touched = useRef(new Set()); // keys edited since the current live fetch began

  const segment = useMemo(() => segments.find((s) => s.id === Number(segId)), [segments, segId]);
  const criteria = segment ? segment.criterias : [];

  // Standalone competitions: no gender split — Hiphop scores dance GROUPS
  // (one per team), Solo Singing scores individual contestants.
  const isStandalone = !!(competition && Number(competition.standalone) === 1);
  const isGroup = isStandalone && competition.unit_type === 'group';

  useEffect(() => {
    (async () => {
      try {
        const compId = competition ? competition.id : null;
        const [seg, cand, jg, ts, sys] = await Promise.all([
          segmentsApi.list(compId),
          candidates.list(compId),
          user.is_admin ? auth.list(compId) : Promise.resolve([]),
          teamsApi.list(compId),
          settingsApi.system(),
        ]);
        setSegments(seg);
        setCandList(cand);
        setTeamList(ts);
        setLocked(!!sys.locked);
        // Judges below belong to this competition (server-side filter).
        const judgesOnly = (jg || []).filter((j) => !j.is_admin);
        setJudges(judgesOnly);
        if (user.is_admin && judgesOnly.length > 0) setActiveJudge(judgesOnly[0].id);
        setSegId(seg[0]?.id ?? null);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, competition]);

  // Reload scores whenever segment or active judge changes.
  useEffect(() => {
    if (!segId) return;
    if (user.is_admin) {
      if (!judges.some((j) => j.id === activeJudge)) return; // admins need a target judge
    }
    let cancelled = false;
    setLoading(true);
    scoresApi
      .get(segId, user.is_admin ? activeJudge : undefined)
      .then((data) => {
        if (cancelled) return;
        setScores(data.scores || {});
      })
      .catch((e) => setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [segId, activeJudge, user.is_admin, judges]);

  // Live refresh (background, no loading flag). Server scores are merged into
  // state, skipping cells that are pending (debounce timer), being saved, or
  // edited while the fetch was in flight, so local edits are never clobbered.
  const live = useRef({});
  live.current = { segId, activeJudge, judges, user, competition };
  useLiveRefresh(async () => {
    const { segId: sid, activeJudge: aj, user: u, competition: comp } = live.current;
    const compId = comp ? comp.id : null;
    touched.current.clear();
    const [seg, cand, jg, ts, sys, sc] = await Promise.all([
      segmentsApi.list(compId),
      candidates.list(compId),
      u.is_admin ? auth.list(compId) : Promise.resolve(null),
      teamsApi.list(compId),
      settingsApi.system(),
      sid && (!u.is_admin || aj != null) ? scoresApi.get(sid, u.is_admin ? aj : undefined) : Promise.resolve(null),
    ]);
    setSegments(seg);
    setCandList(cand);
    setTeamList(ts);
    setLocked(!!sys.locked);
    if (jg) {
      const judgesOnly = jg.filter((j) => !j.is_admin);
      setJudges((prev) =>
        prev.length === judgesOnly.length && prev.every((p, i) => p.id === judgesOnly[i].id && p.name === judgesOnly[i].name)
          ? prev
          : judgesOnly
      );
    }
    if (sc && sid === live.current.segId && aj === live.current.activeJudge) {
      const server = sc.scores || {};
      setScores((prev) => {
        const next = {};
        const keys = new Set([...Object.keys(server), ...Object.keys(prev)]);
        keys.forEach((k) => {
          const dirty = timers.current[k] || inflight.current.has(k) || touched.current.has(k);
          if (dirty) {
            if (k in prev) next[k] = prev[k];
          } else if (k in server) {
            next[k] = server[k];
          }
        });
        return next;
      });
    }
  });

  const visible = candList.filter((c) => {
    if (c.active !== 1 && c.active !== true) return false;
    if (!isStandalone && filter !== 'All' && c.gender !== filter) return false;
    if (teamFilter === 'none') return !c.team_id;
    if (teamFilter !== 'All' && Number(c.team_id) !== Number(teamFilter)) return false;
    return true;
  });

  // Group the scoring entries per team.
  const teamGroups = useMemo(() => {
    if (isStandalone) {
      // One combined list per team (no male/female split). Every team is shown
      // so a judge can see which teams are still missing an entry; solo
      // contestants without a team get their own "No Team" board.
      const groups = teamList.map((t) => ({
        key: `team-${t.id}`,
        name: t.name,
        color: t.color || '#14213d',
        entries: visible.filter((c) => Number(c.team_id) === Number(t.id)),
      }));
      const noTeam = visible.filter((c) => !c.team_id);
      if (noTeam.length) {
        groups.push({ key: 'no-team', name: 'No Team', color: '#8d94a3', entries: noTeam });
      }
      return groups;
    }
    const groups = teamList
      .map((t) => ({
        key: `team-${t.id}`,
        name: t.name,
        color: t.color || '#14213d',
        male: visible.filter((c) => Number(c.team_id) === Number(t.id) && c.gender === 'Male'),
        female: visible.filter((c) => Number(c.team_id) === Number(t.id) && c.gender === 'Female'),
      }))
      .filter((g) => g.male.length || g.female.length);
    const noTeam = visible.filter((c) => !c.team_id);
    if (noTeam.length) {
      groups.push({
        key: 'no-team',
        name: 'No Team',
        color: '#8d94a3',
        male: noTeam.filter((c) => c.gender === 'Male'),
        female: noTeam.filter((c) => c.gender === 'Female'),
      });
    }
    return groups;
  }, [visible, teamList, isStandalone]);

  // Score validation: only a number between 0 and 100 is allowed.
  // Shows a prompt/alert when the entered value is out of range or not numeric,
  // and rejects (does not save) the invalid value so the input reverts.
  // When the system is locked, judges cannot enter scores; admins still can.
  const canScore =
    (user.is_admin || !locked) &&
    (!user.is_admin || (activeJudge != null && judges.some((j) => j.id === activeJudge)));

  const setCell = (key, value) => {
    // Guard: an admin must pick a real (non-admin) judge to score as.
    if (!canScore) {
      window.alert('Select a judge from "Scoring as Judge" first.');
      return;
    }

    // Empty clears the cell (removing a score).
    if (value === '' || value == null) {
      setScores((prev) => ({ ...prev, [key]: '' }));
      scheduleSave(key, null);
      return;
    }

    const num = Number(value);
    if (isNaN(num) || num < 0 || num > 100) {
      window.alert(
        `Invalid score: "${value}".\n\nScores must be a number between 0 and 100.\nThe value you entered was not saved.`
      );
      // Do NOT update state -> the controlled input reverts to its last valid value.
      return;
    }

    setError('');
    setScores((prev) => ({ ...prev, [key]: value }));
    // Pass the exact value being saved so we never fall behind on a fast-typed
    // value (e.g. typing "100" must save 100, not the previous "10").
    scheduleSave(key, num);
  };

  const scheduleSave = (key, value) => {
    touched.current.add(key);
    if (timers.current[key]) clearTimeout(timers.current[key].t);
    timers.current[key] = { t: setTimeout(() => saveKey(key, value), 450), value };
  };

  const saveKey = async (key, value) => {
    if (timers.current[key]) {
      clearTimeout(timers.current[key].t);
      delete timers.current[key];
    }
    const [candidate_id, criteria_id] = key.split(':');
    const clean = value == null || value === '' ? null : Number(value);
    inflight.current.add(key);
    touched.current.add(key);
    setStatus((s) => ({ ...s, [key]: 'saving' }));
    try {
      await scoresApi.save({
        judge_id: user.is_admin ? activeJudge : user.id,
        candidate_id: Number(candidate_id),
        criteria_id: Number(criteria_id),
        score: clean,
      });
      setStatus((s) => ({ ...s, [key]: 'saved' }));
      inflight.current.delete(key);
    } catch (e) {
      inflight.current.delete(key);
      setStatus((s) => ({ ...s, [key]: 'error' }));
      setError(e.message);
    }
    setTimeout(() => {
      setStatus((s) => {
        const n = { ...s };
        delete n[key];
        return n;
      });
    }, 1800);
  };

  const flushAll = () => {
    Object.keys(timers.current).forEach((key) => {
      const entry = timers.current[key];
      if (entry) saveKey(key, entry.value);
    });
  };

  // Flush pending saves when switching segment/judge.
  const flushAndSwitch = (fn) => {
    flushAll();
    fn();
  };

  const filled = Object.values(scores).filter((v) => v !== '' && v != null).length;
  const renderCard = (c) => {
    let total = 0;
    criteria.forEach((crit) => {
      const v = parseFloat(scores[`${c.id}:${crit.id}`]);
      if (!isNaN(v)) total += v * (Number(crit.weight) / 100);
    });
    const tcolor = c.team_color || '#14213d';
    // Prefer this exposure's photo for the candidate; fall back to the main photo.
    const photoSrc = (c.segment_photos || {})[String(segId)]?.photo_url || c.photo_url;
    return (
      <div key={c.id} className={`cand-card${isStandalone ? '' : ' pageant'}`} style={{ '--tcolor': tcolor }}>
        {/* Contender identity — pageant cards stack it on top (photo left, info right) */}
        <div className="cand-id">
          <div className="cand-photo-wrap">
            {photoSrc ? (
              <img className="cand-photo" src={photoSrc} alt={isGroup ? c.group_name : `${c.first_name || ''} ${c.last_name || ''}`} />
            ) : (
              <div className="cand-photo placeholder">
                {isGroup ? (c.group_name || '?').charAt(0) : (c.first_name || '?').charAt(0)}
                {isGroup ? (c.group_name || '').charAt(1) : (c.last_name || '?').charAt(0)}
              </div>
            )}
            <span className="cand-no">#{c.candidate_no}</span>
          </div>
          <div className="cand-title">
            <span className="cand-num">{isGroup ? `Group #${c.candidate_no}` : isStandalone ? `Contestant #${c.candidate_no}` : `Candidate #${c.candidate_no}`}</span>
            <strong>{isGroup ? (c.group_name || 'Unnamed Group') : `${c.first_name} ${c.last_name}`}</strong>
            <div className="cand-tags">
              {!isStandalone && <span className={`badge ${c.gender === 'Male' ? 'm' : 'f'}`}>{c.gender}</span>}
              {c.team_name && (
                <span className="team-badge" style={{ '--tcolor': tcolor }}>
                  <span className="team-dot" style={{ background: tcolor }} />
                  {c.team_name}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Scoring sheet — right panel */}
        <div className="cand-body">
          <div className="cand-criteria-head">
            <span>Criteria</span>
            <span>Score (0–100)</span>
          </div>

          <div className="cand-criteria">
            {criteria.map((crit, ci) => {
              const key = `${c.id}:${crit.id}`;
              const val = scores[key] ?? '';
              const st = status[key];
              return (
                <div key={crit.id} className={`cand-crit ${st ? st : ''}`}>
                  <div className="cand-crit-name">
                    <span className="cand-crit-idx">{ci + 1}</span>
                    <span className="cand-crit-label">{crit.name}</span>
                    <span
                      className="cand-crit-weight"
                      title={`Weight: ${Math.round(Number(crit.weight))}% — this criterion counts ${Math.round(Number(crit.weight))}% of the ${segment ? segment.name : 'segment'} total`}
                    >
                      {Math.round(Number(crit.weight))}%
                    </span>
                  </div>

                  <div className="cand-crit-input">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="0–100"
                      value={val}
                      disabled={!canScore}
                      title={canScore ? 'Score 0–100' : 'Select a judge to score as first'}
                      onKeyDown={(e) => {
                        // Reject clearly-impossible keys: e, E, +, - (minus would allow negative).
                        if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                        // Enter jumps to the next score field so judges stay on the keyboard.
                        if (e.key === 'Enter') {
                          const card = e.currentTarget.closest('.cand-card');
                          const inputs = Array.from(card.querySelectorAll('.cand-crit-input input'));
                          const i = inputs.indexOf(e.currentTarget);
                          const next = inputs[i + 1];
                          if (next) {
                            next.focus();
                            next.select();
                          } else {
                            const wrapper = card.closest('.cand-cards') || card.parentElement;
                            const cards = Array.from(wrapper.querySelectorAll('.cand-card'));
                            const first = cards[cards.indexOf(card) + 1]?.querySelector('.cand-crit-input input');
                            if (first) {
                              first.focus();
                              first.select();
                            } else {
                              e.currentTarget.blur(); // flush any pending autosave
                            }
                          }
                        }
                      }}
                      onChange={(e) => setCell(key, e.target.value)}
                      onBlur={() => {
                        // If a save is still pending, save right away with the latest value.
                        if (timers.current[key]) saveKey(key, timers.current[key].value);
                      }}
                    />
                    {st === 'saving' && <small className="save-flag">…</small>}
                    {st === 'saved' && <small className="save-flag ok">✓</small>}
                    {st === 'error' && <small className="save-flag err">✕</small>}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="cand-total">
            <span>Total Score</span>
            <strong>{total.toFixed(2)}</strong>
          </div>
        </div>
      </div>
    );
  };

  const totalCells = visible.length * criteria.length;

  return (
    <div className="scoring">
      <header className="judge-header">
        <img className="seal-logo" src="/sic-seal.png" alt="San Isidro College seal" />
        <div className="judge-header-titles">
          <h1>Events Scoring System</h1>
          <span>{competition ? competition.name : 'Judging Score Sheet'}</span>
        </div>
      </header>

      {!user.is_admin && segments.length === 0 && (
        <div className="empty-state">
          You are not assigned to a competition yet. Please ask the administrator to add you as a judge.
        </div>
      )}

      <div className="toolbar">
        <div>
          <label className="inline-label">Segment / Exposure</label>
          <div className="seg-btns">
            {segments.map((s) => (
              <button
                key={s.id}
                className={`btn ${segId === s.id ? 'primary' : 'seg'}`}
                onClick={() => flushAndSwitch(() => setSegId(s.id))}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        <div className="toolbar-right">
          {user.is_admin && (
            <label className="filter-label">
              Scoring as Judge (data-entry)
              {judges.length > 0 ? (
                <select
                  value={activeJudge ?? ''}
                  onChange={(e) => flushAndSwitch(() => setActiveJudge(Number(e.target.value)))}
                >
                  {judges.map((j) => (
                    <option key={j.id} value={j.id}>{j.name}</option>
                  ))}
                </select>
              ) : (
                <span className="alert error no-judges">No judges assigned to this competition — add one in the Judges tab.</span>
              )}
            </label>
          )}
          {!isStandalone && (
            <label className="filter-label">
              Gender
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </label>
          )}
          <label className="filter-label">
            Team
            <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
              <option value="All">All</option>
              <option value="none">No Team</option>
              {teamList.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      {locked && !user.is_admin && (
        <div className="scoring-locked-banner" role="status">
          <div>
            <strong>Scoring is locked</strong>
            <span>The administrator has closed scoring. Scores can be viewed but no longer changed.</span>
          </div>
        </div>
      )}

      <div className="sheet-card">
        <div className="sheet-head">
          <h3>{segment ? segment.name : '—'}</h3>
          <div className="sheet-stats">
            <span className="chip"><b>{filled}</b> / {totalCells} filled</span>
            <span className="chip">Scale 0–100</span>
            {criteria.map((c) => (
              <span
                className="chip w"
                title={`Weight: ${Math.round(Number(c.weight))}% — this criterion counts ${Math.round(Number(c.weight))}% toward ${segment ? segment.name : 'the segment'} total`}
              >
                {Math.round(Number(c.weight))}%
              </span>
            ))}
          </div>
        </div>

        <div className="score-guide">
          <strong>How to score:</strong>
          <span>Enter <b>0–100</b> for each criterion</span>
          <span className="guide-dot">•</span>
          <span>
            The <b>% badge</b> on each row shows how much that criterion counts
            toward the <b>Segment Total</b>
          </span>
          <span className="guide-dot">•</span>
          <span>Scores <b>auto-save</b> as you type <span className="save-sample ok">✓</span></span>
          {!canScore && !locked && (
            <span className="guide-warn">Select a judge from “Scoring as Judge” to enter scores.</span>
          )}
          {!canScore && locked && !user.is_admin && (
            <span className="guide-warn">Scoring is locked — you can only view scores.</span>
          )}
        </div>

        {loading ? (
          <div className="empty-state">Loading scores…</div>
        ) : (
          <div className="cand-cards">
            {teamGroups.map((g) => (
              <section className="team-board" key={g.key} style={{ '--tcolor': g.color }}>
                <header className="team-board-head">
                  <span className="team-board-dot" style={{ background: g.color }} />
                  <strong>{g.name}</strong>
                  <span className="team-board-count">
                    {isStandalone
                      ? isGroup
                        ? `${g.entries.length} group(s)`
                        : `${g.entries.length} contestant(s)`
                      : `${g.male.length} Male · ${g.female.length} Female`}
                  </span>
                </header>
                <div className="team-board-body">
                  {isStandalone ? (
                    <div className="team-half-cards">
                      {g.entries.length ? g.entries.map((c) => renderCard(c)) : (
                        <div className="team-half-empty">{isGroup ? 'No group yet — add one in the Candidates tab.' : 'No contestant yet — add one in the Candidates tab.'}</div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="team-half team-half-male">
                        <div className="team-half-label">Male</div>
                        <div className="team-half-cards">
                          {g.male.length ? g.male.map((c) => renderCard(c)) : <div className="team-half-empty">No male candidates</div>}
                        </div>
                      </div>
                      <div className="team-half team-half-female">
                        <div className="team-half-label">Female</div>
                        <div className="team-half-cards">
                          {g.female.length ? g.female.map((c) => renderCard(c)) : <div className="team-half-empty">No female candidates</div>}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </section>
            ))}
            {visible.length === 0 && (
              <div className="empty-state">
                No active candidates yet. Add candidates under the Candidates tab.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}