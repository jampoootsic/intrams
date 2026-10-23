import { useEffect, useRef, useState } from 'react';
import { segmentsApi, scoresApi, settingsApi } from '../api.js';
import { useLiveRefresh } from '../hooks/useLiveRefresh.js';

export default function SettingsTab({ competition }) {
  const [segments, setSegments] = useState([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPw, setResetPw] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetDone, setResetDone] = useState(''); // confirmation shown AFTER deletion
  const [locked, setLocked] = useState(false);    // scoring system lock state
  const [lockBusy, setLockBusy] = useState(false);
  const [confirmLock, setConfirmLock] = useState(false);

  const segDirty = useRef(new Set()); // segments with unsaved local weight edits

  const load = () => {
    segmentsApi.list(competition ? competition.id : null).then(setSegments).catch((e) => setError(e.message));
    settingsApi.system().then((s) => setLocked(!!s.locked)).catch(() => {});
  };
  useEffect(() => {
    segDirty.current.clear();
    load();
  }, [competition]);

  // Background refresh: keep segments with unsaved weight edits as typed.
  useLiveRefresh(() => {
    segmentsApi
      .list(competition ? competition.id : null)
      .then((fresh) =>
        setSegments((prev) =>
          fresh.map((s) => (segDirty.current.has(s.id) ? prev.find((p) => p.id === s.id) || s : s))
        )
      )
      .catch(() => {});
    settingsApi.system().then((s) => setLocked(!!s.locked)).catch(() => {});
  });

  const setSegWeight = (segId, val) => {
    segDirty.current.add(segId);
    setSegments((prev) => prev.map((s) => (s.id === segId ? { ...s, final_weight: val } : s)));
  };
  const setCrit = (segId, critId, field, val) => {
    segDirty.current.add(segId);
    setSegments((prev) =>
      prev.map((s) =>
        s.id === segId
          ? { ...s, criterias: s.criterias.map((c) => (c.id === critId ? { ...c, [field]: val } : c)) }
          : s
      )
    );
  };

  const saveSegment = async (seg) => {
    try {
      setMsg('');
      setError('');
      await segmentsApi.update(seg.id, { final_weight: seg.final_weight });
      for (const c of seg.criterias) {
        await segmentsApi.updateCriteria(c.id, { weight: c.weight });
      }
      segDirty.current.delete(seg.id);
      setMsg(`Saved “${seg.name}”.`);
    } catch (e) {
      setError(e.message);
    }
  };

  const totalFinalWeight = segments.reduce((n, s) => n + Number(s.final_weight || 0), 0);

  const doReset = async () => {
    if (!resetPw) {
      setError('Admin password is required.');
      return;
    }
    setResetBusy(true);
    setResetDone('');
    setError('');
    try {
      const r = await scoresApi.reset(resetPw);
      // Close the password step, then show the post-deletion confirmation.
      setResetOpen(false);
      setResetPw('');
      setResetDone(r.message || 'All scores reset.');
    } catch (e) {
      setError(e.message);
    } finally {
      setResetBusy(false);
    }
  };

  const toggleLock = async () => {
    const next = !locked;
    setLockBusy(true);
    setMsg('');
    setError('');
    try {
      const r = await settingsApi.setLocked(next);
      setLocked(!!r.locked);
      setConfirmLock(false);
      setMsg(next ? 'The scoring system is now LOCKED — judges can no longer change scores.' : 'The scoring system is now UNLOCKED — judges can enter scores again.');
    } catch (e) {
      setError(e.message);
    } finally {
      setLockBusy(false);
    }
  };

  return (
    <div>
      <div className="results-head">
        <h2>Criteria &amp; Weights</h2>
        {competition && <div className="results-subtitle">{competition.name}</div>}
        {competition && Number(competition.standalone) === 1 ? (
          <span className="muted">Standalone event — final weight does not feed the Mr. &amp; Ms. finals</span>
        ) : (
          <span className={`muted ${totalFinalWeight === 100 ? '' : 'warn'}`}>
            Total final weight: {totalFinalWeight}%
            {totalFinalWeight !== 100 && ' (should total 100%)'}
          </span>
        )}
      </div>
      {msg && <div className="alert ok">{msg}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className={`scoring-lock-zone ${locked ? 'locked' : ''}`}>
        <div className="scoring-lock-title">
          <div>
            <strong>{locked ? 'Scoring System Locked' : 'Scoring System Open'}</strong>
            <small>
              {locked
                ? 'Judges can view scores but cannot change them. Admins can still adjust scores.'
                : 'Judges can enter and modify scores. Lock the system once judging is complete.'}
            </small>
          </div>
        </div>
        <div className="scoring-lock-action">
          {!confirmLock ? (
            <button
              className={`btn ${locked ? 'btn danger' : 'btn primary'}`}
              disabled={lockBusy}
              onClick={() => { setConfirmLock(true); setError(''); setMsg(''); }}
            >
              {lockBusy ? 'Saving…' : locked ? 'Unlock Scoring' : 'Lock Scoring'}
            </button>
          ) : (
            <div className="scoring-lock-confirm">
              <span>{locked ? 'Unlock scoring for all judges?' : 'Lock scoring so judges can no longer change scores?'}</span>
              <button type="button" className="btn ghost" disabled={lockBusy} onClick={() => setConfirmLock(false)}>Cancel</button>
              <button
                type="button"
                className={`btn ${locked ? 'btn-ghost' : 'btn danger'}`}
                disabled={lockBusy}
                onClick={toggleLock}
              >
                {lockBusy ? 'Saving…' : locked ? 'Yes, unlock' : 'Yes, lock scoring'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="settings-list">
        {segments.map((seg) => (
          <div className="sheet-card" key={seg.id}>
            <div className="settings-row">
              <div className="settings-title">
                <strong>{seg.name}</strong>
                <small>Code: {seg.code}</small>
              </div>
              <label className="field inline">
                <span>Final weight (%)</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={seg.final_weight}
                  onChange={(e) => setSegWeight(seg.id, e.target.value)}
                />
              </label>
              <button className="btn primary" onClick={() => saveSegment(seg)}>Save</button>
            </div>

            <table className="grid simple">
              <thead>
                <tr>
                  <th>Criterion</th>
                  <th style={{ width: 180 }}>Weight (%)</th>
                </tr>
              </thead>
              <tbody>
                {seg.criterias.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <input
                        className="text-editable"
                        value={c.name}
                        onChange={(e) => setCrit(seg.id, c.id, 'name', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={c.weight}
                        onChange={(e) => setCrit(seg.id, c.id, 'weight', e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="danger-zone">
        <div className="danger-zone-title">
          <strong>Danger Zone</strong>
          <small>Irreversible actions — these cannot be undone.</small>
        </div>
        <div className="danger-zone-row">
          <div>
            <strong>Reset all scores</strong>
            <small>Deletes every score from all judges, candidates &amp; segments. Winners will be cleared until scores are re-entered. Requires your admin password.</small>
          </div>
          <button className="btn danger" onClick={() => { setResetPw(''); setResetDone(''); setError(''); setResetOpen(true); }}>Reset Scores…</button>
        </div>
      </div>

      {resetDone && (
        <div className="modal-overlay" onClick={() => setResetDone('')}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon">✓</div>
            <h3>Scores Reset</h3>
            <p>The deletion completed successfully.</p>
            <div className="confirm-detail">{resetDone}</div>
            <small className="confirm-note">
              All totals and winners have been cleared. Re-enter scores to rebuild them.
            </small>
            <div className="modal-actions">
              <button type="button" className="btn primary" onClick={() => setResetDone('')}>OK, got it</button>
            </div>
          </div>
        </div>
      )}

      {resetOpen && (
        <div className="modal-overlay" onClick={() => { if (!resetBusy) setResetOpen(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-head-title">
                <h3>Reset All Scores</h3>
                <p>This permanently deletes every score. Enter your admin password to confirm.</p>
              </div>
              <button type="button" className="modal-close" onClick={() => { if (!resetBusy) setResetOpen(false); }} aria-label="Close">✕</button>
            </div>
            <label className="field">
              <span>Admin password</span>
              <input
                type="password"
                autoFocus
                value={resetPw}
                disabled={resetBusy}
                onChange={(e) => setResetPw(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') doReset(); }}
                placeholder="Enter your password to confirm"
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn ghost" disabled={resetBusy} onClick={() => setResetOpen(false)}>Cancel</button>
              <button type="button" className="btn danger" disabled={resetBusy} onClick={doReset}>
                {resetBusy ? 'Resetting…' : 'Yes, reset all scores'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}