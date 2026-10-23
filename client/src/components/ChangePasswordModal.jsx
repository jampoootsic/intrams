import { useState } from 'react';
import { auth } from '../api.js';

export default function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({ current: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (form.password.length < 6) return setError('New password must be at least 6 characters.');
    if (form.password !== form.confirm) return setError('New passwords do not match.');
    if (form.password === form.current) return setError('New password must differ from the current one.');
    setBusy(true);
    try {
      await auth.changeOwnPassword(form.current, form.password);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={() => { if (!busy) onClose(); }}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>Change Password</h3>
        {done ? (
          <>
            <div className="alert ok">Password changed. Use it the next time you sign in.</div>
            <div className="modal-actions">
              <button type="button" className="btn primary" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <>
            {error && <div className="alert error">{error}</div>}
            <label className="field">
              <span>Current Password</span>
              <input type="password" autoComplete="current-password" value={form.current} onChange={set('current')} required autoFocus />
            </label>
            <label className="field">
              <span>New Password</span>
              <input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required />
            </label>
            <label className="field">
              <span>Confirm New Password</span>
              <input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>Cancel</button>
              <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Change Password'}</button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
