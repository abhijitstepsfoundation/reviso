import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

interface TopicNote {
  topic: string;
  evidence: string;
}

interface Misconception {
  pattern: string;
  evidence: string;
}

interface LearningProfile {
  headline: string;
  strengths: TopicNote[];
  weaknesses: TopicNote[];
  misconceptions: Misconception[];
  modalityComparison: string;
  trend: string;
  trendNote: string;
  studyPlan: { topic: string; action: string; why: string }[];
  evidenceNote: string;
  evidenceBase: {
    oralSessions: number;
    writtenExams: number;
    questionsAnswered: number;
  };
}

const TREND_LABEL: Record<string, string> = {
  improving: 'Improving',
  steady: 'Steady',
  declining: 'Declining',
  insufficient_data: 'Not enough data yet',
};

export default function Profile() {
  const { signOutUser } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<LearningProfile | null>(null);
  const [empty, setEmpty] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    try {
      const r = await api('/profile');
      setProfile(r.profile);
      setEmpty(Boolean(r.empty));
      setMessage(r.message || '');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    setError('');
    try {
      const r = await api('/profile/refresh', { method: 'POST' });
      setProfile(r.profile);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  };

  const deleteEverything = async () => {
    const typed = prompt(
      'This permanently deletes your materials, assessments and profile. Type DELETE to confirm.'
    );
    if (typed !== 'DELETE') return;

    setDeleting(true);
    try {
      await api('/me', { method: 'DELETE' });
      await signOutUser();
      navigate('/', { replace: true });
    } catch (e: any) {
      setError(e.message);
      setDeleting(false);
    }
  };

  return (
    <div className="page">
      <TopBar back />

      <main className="container">
        <h2>My learning profile</h2>

        {loading ? (
          <p className="muted">Building your profile…</p>
        ) : empty ? (
          <div className="empty">
            <p className="muted">{message}</p>
            <div className="exam-actions" style={{ justifyContent: 'center' }}>
              <Link to="/exam" className="btn primary">
                Take an oral viva
              </Link>
              <Link to="/written" className="btn">
                Sit a written paper
              </Link>
            </div>
          </div>
        ) : profile ? (
          <>
            <p className="muted sub">
              Built from {profile.evidenceBase.oralSessions} oral viva
              {profile.evidenceBase.oralSessions === 1 ? '' : 's'} and{' '}
              {profile.evidenceBase.writtenExams} written paper
              {profile.evidenceBase.writtenExams === 1 ? '' : 's'} ·{' '}
              {profile.evidenceBase.questionsAnswered} questions answered
            </p>

            {error && <p className="error">{error}</p>}

            <div className="score-card">
              <div>
                <p className="headline">{profile.headline}</p>
                <span className="pill">{TREND_LABEL[profile.trend]}</span>
                {profile.trendNote && (
                  <p className="muted small" style={{ marginTop: 8 }}>
                    {profile.trendNote}
                  </p>
                )}
              </div>
            </div>

            {profile.modalityComparison && (
              <section className="report-block highlight">
                <h3>Speaking versus writing</h3>
                <p>{profile.modalityComparison}</p>
              </section>
            )}

            {!!profile.misconceptions.length && (
              <section className="report-block">
                <h3>Recurring misconceptions</h3>
                <p className="muted small">
                  These reasoning patterns appeared more than once, so they are
                  not one-off slips. They will keep costing you marks until
                  they're corrected.
                </p>
                {profile.misconceptions.map((m, i) => (
                  <div className="plan-item" key={i}>
                    <div className="plan-topic">{m.pattern}</div>
                    <div className="muted small">{m.evidence}</div>
                  </div>
                ))}
              </section>
            )}

            {!!profile.weaknesses.length && (
              <section className="report-block">
                <h3>Where you're losing marks</h3>
                {profile.weaknesses.map((w, i) => (
                  <div className="plan-item" key={i}>
                    <div className="plan-topic">{w.topic}</div>
                    <div className="muted small">{w.evidence}</div>
                  </div>
                ))}
              </section>
            )}

            {!!profile.strengths.length && (
              <section className="report-block">
                <h3>What you've shown you understand</h3>
                {profile.strengths.map((s, i) => (
                  <div className="plan-item" key={i}>
                    <div className="plan-topic">{s.topic}</div>
                    <div className="muted small">{s.evidence}</div>
                  </div>
                ))}
              </section>
            )}

            {!!profile.studyPlan.length && (
              <section className="report-block">
                <h3>Your study plan</h3>
                <p className="muted small">
                  Ordered by what would gain you the most marks first.
                </p>
                {profile.studyPlan.map((s, i) => (
                  <div className="plan-item" key={i}>
                    <div className="plan-topic">
                      {i + 1}. {s.topic}
                    </div>
                    <div>{s.action}</div>
                    <div className="muted small">{s.why}</div>
                  </div>
                ))}
              </section>
            )}

            {profile.evidenceNote && (
              <p className="muted small">{profile.evidenceNote}</p>
            )}

            <div className="exam-actions">
              <button className="btn" onClick={refresh} disabled={refreshing}>
                {refreshing ? 'Rebuilding…' : 'Rebuild profile'}
              </button>
              <Link to="/exam" className="btn ghost">
                Take another viva
              </Link>
            </div>
          </>
        ) : (
          <p className="error">{error || 'Profile unavailable.'}</p>
        )}

        <section className="danger-zone">
          <h3>Your data</h3>
          <p className="muted small">
            Everything Reviso holds about you lives under your own account.
            Deleting removes your materials, uploaded files, assessments and
            this profile. It cannot be undone.
          </p>
          <button
            className="btn ghost danger"
            onClick={deleteEverything}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete all my data'}
          </button>
        </section>
      </main>
    </div>
  );
}
