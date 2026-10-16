import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const ICON_USER = (
  <svg className="ficon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="6.4" r="3.5" />
    <path d="M6.8 10.2 L17.2 10.2 L17.2 20 L6.8 20" />
  </svg>
);

const ICON_LOCK = (
  <svg className="ficon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="6.2" y="9.2" width="11.6" height="10.6" rx="2.2" />
    <circle cx="12" cy="14.4" r="2.5" />
    <path d="M12.8 9.2 a6 6 0 1 1 11.2 9.2" />
  </svg>
);

const ICON_EYE = (
  <svg className="ficon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="6.6" />
    <circle cx="12" cy="12" r="2.4" />
  </svg>
);

const ICON_EYE_SLASH = (
  <svg className="ficon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="6.6" />
    <circle cx="12" cy="12" r="2.4" />
    <path d="M5.2 20 L18.8 4" />
  </svg>
);

const ICON_ALERT = (
  <svg className="ficon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3.4 L20.6 11.6 L12 19.8 L3.4 11.6 Z" />
    <path d="M12 7.4 L12 15.4" />
    <circle cx="12" cy="18.4" r="1.1" />
  </svg>
);


export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter your username and password.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const year = new Date().getFullYear();

  return (
    <div className="login-page">
      <div className="login-shell">
        <aside className="login-panel">
          <div className="login-ring" aria-hidden="true" />
          <span className="login-panel-eyebrow">San Isidro College</span>
          <span className="login-badge">
            <img className="login-badge-logo" src="/tabulator.png" alt="San Isidro College logo" />
          </span>
          <h1 className="login-panel-title">
            Events Scoring
            <br />
            System
          </h1>
          <p className="login-panel-sub">Live Scoring &amp; Results System</p>
          <div className="login-panel-divider" />
          <p className="login-panel-desc">
            Real-time judging for pageants, performances and more — with
            automatic rankings and winners across all your events.
          </p>
          <div className="login-panel-points">
            <span className="login-point"><span className="d">✦</span>Live scoring</span>
            <span className="login-point"><span className="d">✦</span>Auto-save</span>
            <span className="login-point"><span className="d">✦</span>Instant rankings</span>
          </div>
          <p className="login-panel-copy">© {year} San Isidro College Events Scoring System</p>
        </aside>

        <section className="login-form-side">
          <div className="login-card">
            <span className="login-eyebrow">Member sign in</span>
            <h2 className="login-title">Welcome back</h2>
            <p className="login-sub">Enter your credentials to access the scoring dashboard.</p>

            {error && (
              <div className="alert login-alert error" role="alert">
                {ICON_ALERT}
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={submit} noValidate>
              <div className="field login-field">
                <label className="login-label" htmlFor="login-username">Username</label>
                <div className="login-inputwrap">
                  <input
                    id="login-username"
                    name="username"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    autoFocus
                  />
                  {ICON_USER}
                </div>
              </div>

              <div className="field login-field">
                <label className="login-label" htmlFor="login-password">Password</label>
                <div className="login-inputwrap">
                  <input
                    id="login-password"
                    name="password"
                    type={show ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                  />
                  {ICON_LOCK}
                  <button
                    type="button"
                    className="login-eye"
                    onClick={() => setShow(!show)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                    title={show ? 'Hide password' : 'Show password'}
                  >
                    {show ? ICON_EYE_SLASH : ICON_EYE}
                  </button>
                </div>
              </div>

              <button type="submit" className="btn primary block login-submit" disabled={busy}>
                {busy && <span className="login-spinner" aria-hidden="true" />}
                {busy ? 'Signing in…' : 'Sign in to dashboard'}
              </button>
            </form>
          </div>

          <p className="login-form-foot">
            Secure access · San Isidro College judges &amp; administrators
          </p>
        </section>
      </div>
    </div>
  );
}