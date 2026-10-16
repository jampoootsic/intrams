import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { competitions as competitionsApi } from './api.js';
import Login from './components/Login.jsx';
import Layout from './components/Layout.jsx';
import ScoringTab from './components/ScoringTab.jsx';
import ResultsTab from './components/ResultsTab.jsx';
import CandidatesTab from './components/CandidatesTab.jsx';
import TeamsTab from './components/TeamsTab.jsx';
import JudgesTab from './components/JudgesTab.jsx';
import SettingsTab from './components/SettingsTab.jsx';

function Shell() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState('scoring');
  const [competitions, setCompetitions] = useState([]);
  const [compId, setCompId] = useState(null);

  useEffect(() => {
    if (loading || !user) return;
    if (user.is_admin) {
      // Admins can switch between every competition.
      competitionsApi
        .list()
        .then((rows) => {
          setCompetitions(rows || []);
          setCompId((rows && rows[0]) ? rows[0].id : null);
        })
        .catch(() => setCompetitions([]));
    } else {
      // A judge is locked to their own competition.
      // The competition's type (standalone / group vs individual) comes from the
      // login payload so the scoring page uses the right layout (Mr.&Ms. gender
      // split vs. per-team groups/contestants for standalone events).
      const own = user.competition_id
        ? [{
            id: user.competition_id,
            code: '',
            name: user.competition_name || 'My Competition',
            standalone: user.competition_standalone ?? 0,
            unit_type: user.competition_unit_type,
          }]
        : [];
      setCompetitions(own);
      setCompId(user.competition_id || null);
    }
  }, [loading, user]);

  const competition = competitions.find((c) => Number(c.id) === Number(compId)) || null;

  if (loading) {
    return <div className="loading-screen">Loading…</div>;
  }
  if (!user) {
    return <Login />;
  }

  return (
    <Layout
      user={user}
      tab={tab}
      onTab={setTab}
      onLogout={useAuth().logout}
      competitions={competitions}
      competition={competition}
      onCompetition={(id) => { setCompId(id); setTab('scoring'); }}
    >
      {competition && (
        <>
          {tab === 'scoring' && <ScoringTab user={user} competition={competition} />}
          {tab === 'results' && user.is_admin && <ResultsTab competition={competition} />}
          {tab === 'candidates' && user.is_admin && <CandidatesTab competition={competition} />}
          {tab === 'teams' && user.is_admin && <TeamsTab competition={competition} />}
          {tab === 'judges' && user.is_admin && <JudgesTab competition={competition} />}
          {tab === 'settings' && user.is_admin && <SettingsTab competition={competition} />}
          {tab === 'results' && !user.is_admin && <NoAccess message="Results & winners are only shown to administrators." />}
          {tab === 'candidates' && !user.is_admin && <NoAccess message="Candidates management is for administrators." />}
          {tab === 'teams' && !user.is_admin && <NoAccess message="Team management is for administrators." />}
          {tab === 'judges' && !user.is_admin && <NoAccess message="Judge management is for administrators." />}
          {tab === 'settings' && !user.is_admin && <NoAccess message="Settings are for administrators." />}
        </>
      )}
    </Layout>
  );
}

function NoAccess({ message }) {
  return <div className="empty-state">{message}</div>;
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}