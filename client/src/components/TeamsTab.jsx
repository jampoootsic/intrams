import { useEffect, useState } from 'react';
import { teams as teamsApi, candidates as candidatesApi } from '../api.js';

const DEFAULT_COLORS = ['#14213d', '#2753a0', '#8a2f6b', '#a02c2c', '#2e7d46', '#b37400', '#5a2ca0', '#0f7f8c'];

export default function TeamsTab({ competition }) {
  const [list, setList] = useState([]);
  const [modal, setModal] = useState(null); // { } add | { id } edit
  const [form, setForm] = useState({ name: '', color: DEFAULT_COLORS[0] });
  const [error, setError] = useState('');

  const compId = competition ? competition.id : null;
  const load = () => teamsApi.list(compId).then(setList).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [competition]);

  const openAdd = () => {
    setForm({ name: '', color: DEFAULT_COLORS[list.length % DEFAULT_COLORS.length] });
    setModal({});
    setError('');
  };
  const openEdit = (t) => {
    setForm({ name: t.name, color: t.color });
    setModal({ id: t.id });
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('Team name is required.');
    try {
      if (modal.id) await teamsApi.update(modal.id, { name: form.name, color: form.color });
      else await teamsApi.create({ name: form.name, color: form.color, competition_id: compId });
      setModal(null);
      load();
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (t) => {
    if (!window.confirm(`Delete team "${t.name}"? Its ${t.member_count} candidate(s) will become unassigned (scores are kept).`)) return;
    try {
      await teamsApi.remove(t.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="results-head">
        <h2>Manage Teams</h2>
        <button className="btn primary" onClick={openAdd}>+ Add Team</button>
      </div>
      {error && <div className="alert error">{error}</div>}

      <div className="team-summary">
        {list.map((t) => (
          <div className="team-card" key={t.id} style={{ '--tcolor': t.color }}>
            <span className="team-dot" style={{ background: t.color }} />
            <div className="team-card-body">
              <strong>{t.name}</strong>
              <small>{t.member_count} member(s)</small>
            </div>
            <div className="team-card-actions">
              <button className="btn small" onClick={() => openEdit(t)}>Edit</button>
              <button className="btn small danger" onClick={() => remove(t)}>Delete</button>
            </div>
          </div>
        ))}
        {list.length === 0 && (
          <div className="empty-state">No teams yet. Create teams first, then assign candidates to them.</div>
        )}
      </div>

      {modal !== null && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <h3>{modal.id ? 'Edit Team' : 'Add Team'}</h3>
            <label className="field">
              <span>Team Name</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Team Blue" required />
            </label>
            <label className="field">
              <span>Color</span>
              <div className="color-row">
                {DEFAULT_COLORS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={`color-swatch ${form.color === c ? 'active' : ''}`}
                    style={{ background: c }}
                    onClick={() => setForm({ ...form, color: c })}
                    aria-label={c}
                  />
                ))}
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(form.color) ? form.color : '#14213d'}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="color-input"
                  title="Custom color"
                />
              </div>
            </label>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn primary">{modal.id ? 'Save Changes' : 'Add Team'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}