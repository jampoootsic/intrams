import { useEffect, useState } from 'react';
import { resultsApi } from '../api.js';

const SEGMENT_LABELS = {
  jeans: 'Jeans Attire',
  sports: 'Sports Attire',
  cultural: 'Cultural Attire',
  formal: 'Formal Attire',
  talent: 'Talent',
  qa: 'Q&A',
  hiphop: 'Hiphop',
};

// The Mr./Ms. overall standings only list the pageant segments (final_weight > 0).
// Standalone events (e.g. Hiphop) are reported via the "Best in Segment" awards.
const PAGEANT_SEGMENTS = (segments) => segments.filter((s) => Number(s.final_weight) > 0);

export default function ResultsTab({ competition }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [printOpen, setPrintOpen] = useState(false); // summary category picker modal
  const [printSel, setPrintSel] = useState(null); // selected category id
  const [printing, setPrinting] = useState(false); // render the print-only summary

  const load = () => {
    resultsApi.get(competition ? competition.id : null).then(setData).catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
  }, [competition]);

  if (error) return <div className="alert error">{error}</div>;
  if (!data) return <div className="empty-state">Loading results…</div>;

  const { competition: comp, ranked, winners, bests, segments, judgeCount, teamStandings, titles } = data;
  const standalone = comp ? Number(comp.standalone) === 1 : false;
  const isGroup = standalone && comp && comp.unit_type === 'group';
  const genders = standalone ? ['Team'] : ['Male', 'Female'];
  // Combined pageants hide standalone segments from the Mr./Ms. standings table.
  const standingsSegs = standalone ? segments : PAGEANT_SEGMENTS(segments);

  const candName = (c) => (c.group_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || '—');
  const nameOf = (row) => (row ? candName(row.candidate) : '—');

  const teamOf = (row) =>
    row && row.candidate.team_name
      ? { name: row.candidate.team_name, color: row.candidate.team_color || '#14213d' }
      : null;

  // Best-in-segment cards show that segment's photo when available.
  const photoFor = (row, seg) => {
    if (!row) return null;
    return (row.candidate.segment_photos || {})[String(seg.id)]?.photo_url || row.candidate.photo_url;
  };
  const bestPhoto = (row, seg) => {
    const p = photoFor(row, seg);
    return p ? <img className="thumb sm" src={p} alt="winner" /> : null;
  };

  // ---- Categories available for the print-summary picker ----
  const PRINT_OPTIONS = [
    { id: 'main', label: 'Champions & Runners-up', desc: `${comp ? comp.name : 'Competition'} — champion and 1st, 2nd & 3rd Runner-up (Male & Female)` },
    ...segments.map((s) => ({ id: `seg-${s.code}`, label: s.name, desc: 'Best in category — Male & Female winners' })),
    { id: 'teams', label: 'Team Standings', desc: 'Teams ranked by average final score' },
    { id: 'overall', label: 'Overall Standings', desc: 'Full per-gender ranking tables' },
  ];

  const summaryTitle = (id) => {
    if (id === 'main') return 'Champions & Runners-up';
    if (id.startsWith('seg-')) {
      const s = segments.find((x) => x.code === id.slice(4));
      return s ? s.name : 'Category';
    }
    if (id === 'teams') return 'Team Standings';
    if (id === 'overall') return 'Overall Standings';
    return '';
  };

  const doPrint = () => {
    setPrintOpen(false);
    if (!printSel) return;
    setPrinting(true);
    // Let the summary render, then open the system print dialog.
    setTimeout(() => {
      document.body.classList.add('print-summary-mode');
      window.print();
      // Remove the summary after the dialog closes (works even if window.print
      // returns immediately in some browsers).
      setTimeout(() => {
        document.body.classList.remove('print-summary-mode');
        setPrinting(false);
      }, 200);
    }, 250);
  };

  // ---- Reusable content blocks (used on screen AND in the print summary) ----
  const champInitials = (c) =>
    standalone
      ? (c.group_name || '?').slice(0, 2).toUpperCase()
      : `${(c.first_name || '?').charAt(0)}${(c.last_name || '?').charAt(0)}`;

  const champCards = genders.map((gender) => {
    const w = winners[gender];
    const champion = w.champion;
    const isPrince = gender === 'Male';
    return (
      <div className="champ-card" key={gender}>
        <div className="champ-crown">✦</div>
        <div className={`champ-avatar ${isPrince ? 'p' : 'q'}`}>
          {champion && champion.candidate.photo_url ? (
            <img className="champ-photo" src={champion.candidate.photo_url} alt={nameOf(champion)} />
          ) : champion ? (
            champInitials(champion.candidate)
          ) : '?'}
        </div>
        <div className="champ-title">
          {standalone ? 'Champion' : (isPrince ? 'Mr. Isidran Intramurals' : 'Ms. Isidran Intramurals')}
        </div>
        {champion && (
          <div className="champ-no">{isGroup ? `Group #${champion.candidate.candidate_no}` : standalone ? `Contestant #${champion.candidate.candidate_no}` : `Candidate #${champion.candidate.candidate_no}`}</div>
        )}
        <div className="champ-name">{nameOf(champion)}</div>
        {teamOf(champion) && (
          <div className="champ-team">
            <span className="team-dot" style={{ background: teamOf(champion).color }} />
            {teamOf(champion).name}
          </div>
        )}
        <div className="champ-score">
          Final Score: {champion ? champion.finalScore.toFixed(4) : '—'}
        </div>
      </div>
    );
  });

  const runnerCards = genders.flatMap((gender) => {
    const w = winners[gender];
    return [
      ['First Runner Up', w.firstRunnerUp],
      ['Second Runner Up', w.secondRunnerUp],
      ['Third Runner Up', w.thirdRunnerUp],
    ].map(([title, row]) => (
      <div className="ru-card" key={`${gender}-${title}`}>
        {row && (
          <div className="ru-photo">
            {row.candidate.photo_url ? (
              <img src={row.candidate.photo_url} alt={nameOf(row)} />
            ) : (
              <span>{champInitials(row.candidate)}</span>
            )}
          </div>
        )}
        <div className="ru-place">{title.replace(' Runner Up', '')}</div>
        <div className="ru-gender">{standalone ? (isGroup ? 'Team' : 'Contestant') : gender}</div>
        <div className="ru-name">{nameOf(row)}</div>
        {teamOf(row) && (
          <div className="ru-team">
            <span className="team-dot" style={{ background: teamOf(row).color }} />
            {teamOf(row).name}
          </div>
        )}
        <div className="ru-score">{row ? `${row.candidate.candidate_no} · ${row.finalScore.toFixed(4)}` : '—'}</div>
      </div>
    ));
  });

  const bestCardByCode = Object.fromEntries(
    segments.map((seg) => [
      seg.code,
      (
        <div className="best-card" key={seg.id}>
          <div className="best-seg">{seg.name}</div>
          <div className="best-rows">
            {genders.map((g) => {
              const b = bests[seg.code] && bests[seg.code][g];
              return (
                <div className="best-row" key={g}>
                  <span>{standalone ? 'Winner' : g}</span>
                  <div className="best-info">
                    <strong>{b ? nameOf(b) : '—'}</strong>
                    <small>{b ? `#${b.candidate.candidate_no} · ${b.score.toFixed(2)}` : ''}</small>
                  </div>
                  {bestPhoto(b, seg)}
                </div>
              );
            })}
          </div>
        </div>
      ),
    ])
  );

  const teamCards = (teamStandings || []).map((t, idx) => (
    <div className={`team-stand-card ${idx === 0 ? 'top' : ''}`} key={t.id} style={{ '--tcolor': t.color }}>
      <span className="team-rank">{idx + 1}</span>
      <span className="team-dot lg" style={{ background: t.color }} />
      <div className="team-stand-body">
        <strong>{t.name}</strong>
        <small>{t.members} {standalone ? (isGroup ? (t.members === 1 ? 'group' : 'groups') : (t.members === 1 ? 'soloist' : 'soloists')) : (t.members === 1 ? 'member' : 'members')} · {t.champions} podium finish(es)</small>
      </div>
      <div className="team-stand-score">
        <span>{t.average.toFixed(4)}</span>
        <small>avg final</small>
      </div>
    </div>
  ));

  const overallTables = genders.map((gender) => (
    <div className="standing-table" key={gender}>
      <h4>{standalone ? (isGroup ? 'Team Groups (Combined Ranking)' : 'Soloists (Combined Ranking)') : `${gender} Candidates`}</h4>
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Group / Candidate</th>
            {standingsSegs.map((s) => (
              <th key={s.id} title={`${s.name} (${SEGMENT_LABELS[s.code] || ''})`}>{SEGMENT_LABELS[s.code] || s.name}</th>
            ))}
            <th>Final</th>
          </tr>
        </thead>
        <tbody>
          {(ranked[gender] || []).map((row, idx) => {
            const place = idx === 0 ? 'Champion' : `${idx}${suffix(idx)} RU`;
            return (
              <tr key={row.candidate.id} className={idx === 0 ? 'champ-row' : ''}>
                <td><span className={`rank-chip ${idx === 0 ? 'gold' : ''}`}>{idx + 1}</span> {place}</td>
                <td>
                  <div className="standing-name">
                    {row.candidate.photo_url && (
                      <img className="thumb sm" src={row.candidate.photo_url} alt={row.candidate.first_name} />
                    )}
                    <div>
                      <strong>{row.candidate.candidate_no} · {candName(row.candidate)}</strong>
                      {row.candidate.team_name && (
                        <span className="team-badge mini" style={{ '--tcolor': row.candidate.team_color || '#14213d' }}>
                          <span className="team-dot" style={{ background: row.candidate.team_color || '#14213d' }} />
                          {row.candidate.team_name}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                {standingsSegs.map((s) => (<td key={s.id}>{row.segmentScores[s.code].toFixed(2)}</td>))}
                <td className="final"><strong>{row.finalScore.toFixed(4)}</strong></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  ));

  const summaryBody = (id) => {
    if (id === 'main') return (<><div className="champions">{champCards}</div><div className="ru-grid">{runnerCards}</div></>);
    if (id.startsWith('seg-')) return (<div className="best-grid">{bestCardByCode[id.slice(4)] || null}</div>);
    if (id === 'teams') return (<div className="team-standings">{teamCards}</div>);
    if (id === 'overall') return (<div className="standings">{overallTables}</div>);
    return null;
  };

  return (
    <div className="results-tab">
      <div className="results">
      {/* Print-only letterhead — hidden on screen, shown in print/PDF */}
      <div className="print-header">
        <div className="print-brand">
          <div className="brand-badge small">SI</div>
          <div>
            <strong>San Isidro College</strong>
            <span>{comp ? comp.name : 'Events'} — Official Results</span>
          </div>
        </div>
        <div className="print-meta">
          <span>Printed {new Date().toLocaleString()}</span>
          <span>{judgeCount} judge(s)</span>
        </div>
      </div>

      <div className="results-head">
        <h2>Results &amp; Winners</h2>
          {comp && <div className="results-subtitle">{comp.name}</div>}
        <div className="row">
          <button className="btn primary" onClick={load}>Refresh</button>
          <button type="button" className="btn" onClick={() => window.print()}>Print Winners</button>
          <button type="button" className="btn" onClick={() => setPrintOpen(true)}>Print Summary</button>
          <span className="muted">{judgeCount} judge(s) · rankings update live</span>
        </div>
      </div>

      {/* Champion cards */}
      <div className="champions">{champCards}</div>

      {/* Runners-up */}
      <div className="ru-grid">{runnerCards}</div>

      {/* Best in segment per gender */}
      <h3>Best in Segment Awards</h3>
      <div className="best-grid">{segments.map((s) => bestCardByCode[s.code])}</div>

      {/* Team standings */}
      {teamStandings && teamStandings.length > 0 && (
        <>
          <h3>Team Standings</h3>
          <div className="team-standings">{teamCards}</div>
        </>
      )}

      {/* Full standings */}
      <h3>Overall Standings</h3>
      <div className="standings">{overallTables}</div>
      </div>

      {/* Print-only summary of a selected category — hidden on screen, shown in print */}
      {printing && printSel && (
        <div className="print-summary">
          <div className="print-header">
            <div className="print-brand">
              <div className="brand-badge small">SI</div>
              <div>
                <strong>San Isidro College</strong>
                <span>{comp ? comp.name : 'Events'} — Official Summary</span>
              </div>
            </div>
            <div className="print-meta">
              <span>Printed {new Date().toLocaleString()}</span>
              <span>{judgeCount} judge(s)</span>
            </div>
          </div>
          <h1 className="print-summary-title">{summaryTitle(printSel)}</h1>
          {summaryBody(printSel)}
        </div>
      )}

      {/* Category picker for the print summary */}
      {printOpen && (
        <div className="modal-overlay" onClick={() => setPrintOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-head-title">
                <h3>Print Summary</h3>
                <p>Select a category, then print a summary sheet for it.</p>
              </div>
              <button type="button" className="modal-close" onClick={() => setPrintOpen(false)}>✕</button>
            </div>
            <div className="print-options">
              {PRINT_OPTIONS.map((opt) => (
                <label key={opt.id} className={`print-option ${printSel === opt.id ? 'on' : ''}`}>
                  <input
                    type="radio"
                    name="print-summary-cat"
                    checked={printSel === opt.id}
                    onChange={() => setPrintSel(opt.id)}
                  />
                  <div>
                    <strong>{opt.label}</strong>
                    {opt.desc && <small>{opt.desc}</small>}
                  </div>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <span className="modal-hint">Prints one summary sheet for the selected category</span>
              <button type="button" className="btn ghost" onClick={() => setPrintOpen(false)}>Cancel</button>
              <button type="button" className="btn primary" disabled={!printSel} onClick={doPrint}>Print</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function suffix(n) {
  if (n === 1) return 'st';
  if (n === 2) return 'nd';
  if (n === 3) return 'rd';
  return 'th';
}