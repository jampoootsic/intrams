const TABS = [
  { key: 'scoring', label: 'Scoring' },
  { key: 'results', label: 'Results & Winners', admin: true },
  { key: 'candidates', label: 'Candidates', admin: true },
  { key: 'teams', label: 'Teams', admin: true },
  { key: 'judges', label: 'Judges', admin: true },
  { key: 'settings', label: 'Criteria & Weights', admin: true },
];

export default function Layout({ user, tab, onTab, onLogout, competitions, competition, onCompetition, children }) {
  const visibleTabs = TABS.filter((t) => !t.admin || user.is_admin);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-badge small">SIC</span>
          <div>
            <strong>Events Scoring System</strong>
            <small>San Isidro College</small>
          </div>
        </div>

        <div className="topbar-right">
          <div className="user-chip">
            <span className="avatar">{user.name.charAt(0).toUpperCase()}</span>
            <div className="user-meta">
              <strong>{user.name}</strong>
              <small>{user.is_admin ? 'Administrator' : 'Judge'}</small>
            </div>
          </div>
          <button className="btn ghost" onClick={onLogout}>Logout</button>
        </div>
      </header>

      {/* Competition switcher — each competition has its own judges, candidates,
          teams, scoring, criteria and results. */}
      {competitions.length > 0 && (
        <nav className="comp-bar">
          {competitions.map((c) => (
            <button
              key={c.id}
              className={`comp-pill ${competition && Number(competition.id) === Number(c.id) ? 'active' : ''}`}
              onClick={() => onCompetition(c.id)}
            >
              {c.name}
            </button>
          ))}
          {competition && user.is_admin && (
            <span className="comp-sub">{competition.standalone ? 'Standalone event' : 'Combined pageant'}</span>
          )}
        </nav>
      )}

      <nav className="tabs">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => onTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="content">{children}</main>
    </div>
  );
}