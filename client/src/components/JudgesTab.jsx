import { useEffect, useState } from 'react';
import { auth, competitions as competitionsApi } from '../api.js';
import { useLiveRefresh } from '../hooks/useLiveRefresh.js';

export default function JudgesTab({ competition }) {
  const [list, setList] = useState([]);
  const [competitions, setCompetitions] = useState([]);
  // null | { mode: 'add' } | { mode: 'reset', id, name }
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: '', username: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const compId = competition ? competition.id : null;

  const load = () =>
    Promise.all([auth.list(compId), competitionsApi.list()])
      .then(([judgeList, compList]) => {
        setList(judgeList);
        setCompetitions(compList);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, [competition]);
  useLiveRefresh(() => load());

  const openAdd = () => {
    setForm({ name: '', username: '', password: '', confirm: '' });
    setError('');
    setModal({ mode: 'add' });
  };

  const submitAdd = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await auth.create({
        name: form.name,
        username: form.username,
        password: form.password,
        competition_id: compId,
      });
      setModal(null);
      setForm({ name: '', username: '', password: '', confirm: '' });
      setError('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await auth.resetPassword(modal.id, form.password);
      setModal(null);
      setForm({ name: '', username: '', password: '', confirm: '' });
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const moveJudge = async (j, newCompId) => {
    if (!newCompId || Number(newCompId) === Number(j.competition_id)) return;
    try {
      await auth.updateCompetition(j.id, newCompId);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (j) => {
    if (!window.confirm(`Delete judge "${j.name}"? Their scores will also be removed.`)) return;
    try {
      await auth.remove(j.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="results-head">
        <h2>Manage Judges</h2>
        {competition && <div className="results-subtitle">{competition.name}</div>}
        <button className="btn primary" onClick={openAdd}>
          + Add Judge
        </button>
      </div>
      {error && <div className="alert error">{error}</div>}

      <div className="sheet-card">
        <table className="grid simple">
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Role</th>
              <th>Competition</th>
              <th className="actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((j) => (
              <tr key={j.id}>
                <td><strong>{j.name}</strong></td>
                <td>{j.username}</td>
                <td><span className={`badge ${j.is_admin ? 'm' : 'f'}`}>{j.is_admin ? 'Admin' : 'Judge'}</span></td>
                <td className="muted">{j.competition_name || (j.is_admin ? 'All' : '—')}</td>
                <td className="actions">
                  {!j.is_admin && (
                    <>
                      {competitions.length > 1 && (
                        <label className="move-target">
                          Move to&nbsp;
                          <select
                            value={j.competition_id ?? ''}
                            onChange={(e) => moveJudge(j, e.target.value)}
                          >
                            {competitions.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </label>
                      )}
                      <button className="btn small" onClick={() => { setForm({ name: j.name, username: j.username, password: '', confirm: '' }); setError(''); setModal({ mode: 'reset', id: j.id, name: j.name }); }}>
                        Reset Password
                      </button>
                      <button className="btn small danger" onClick={() => remove(j)}>Delete</button>
                    </>
                  )}
                  {j.is_admin && <span className="muted">—</span>}
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan="5" className="empty-state">No judges for this competition yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {competition && (
        <p className="muted">
          These judges only score <strong>{competition.name}</strong>. New judges are added to this
          competition; to move a judge to the other competition use the “Move to” picker below.
        </p>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => { if (!busy) setModal(null); }}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={modal.mode === 'add' ? submitAdd : submitPassword}>
            <h3>{modal.mode === 'add' ? `Add Judge · ${competition ? competition.name : ''}` : `Reset Password · ${modal.name}`}</h3>
            {modal.mode === 'add' && (
              <>
                <label className="field">
                  <span>Full Name</span>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </label>
                <label className="field">
                  <span>Username</span>
                  <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
                </label>
              </>
            )}
            <label className="field">
              <span>{modal.mode === 'add' ? 'Password' : 'New Password'}</span>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </label>
            <label className="field">
              <span>Confirm Password</span>
              <input type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn ghost" disabled={busy} onClick={() => setModal(null)}>Cancel</button>
              <button className="btn primary" disabled={busy}>
                {busy ? 'Saving…' : modal.mode === 'add' ? 'Add Judge' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}