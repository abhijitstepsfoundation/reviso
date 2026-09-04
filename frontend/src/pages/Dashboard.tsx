import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import TopBar from '../components/TopBar';
import { api } from '../lib/api';
import { Spinner } from '../components/Spinner';

interface Me {
  uid: string;
  displayName?: string;
}

interface SessionSummary {
  id: string;
  materialTitle: string;
  status: string;
  questionsAsked: number;
  scoreOutOf10: number | null;
  createdAt: string | null;
}

interface ExamSummary {
  id: string;
  title: string;
  status: string;
  totalMarks: number | null;
  totalAwarded: number | null;
  scriptAppearance: string | null;
  durationMinutes: number | null;
  createdAt: string | null;
}

const APPEARANCE_LABEL: Record<string, string> = {
  printed: 'Not handwritten',
  mixed: 'Partly handwritten',
  unclear: 'Format unclear',
};

export default function Dashboard() {
  const [me, setMe] = useState<Me | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api<Me>('/me').then(setMe),
      api<any[]>('/materials').then((m) => setCount(m.length)),
      api<SessionSummary[]>('/sessions').then(setSessions),
      api<ExamSummary[]>('/exams').then(setExams),
    ])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const doneSessions = sessions.filter((s) => s.status === 'completed');
  const doneExams = exams.filter((e) => e.status === 'graded');
  const openSessions = sessions.filter((s) => s.status === 'active');
  const openExams = exams.filter((e) => e.status === 'ready');
  const hasOpen = openSessions.length + openExams.length > 0;

  const history = [
    ...doneSessions.map((s) => ({
      key: `s-${s.id}`,
      to: `/review/oral/${s.id}`,
      title: s.materialTitle,
      meta: `Oral viva · ${s.questionsAsked} questions`,
      score: s.scoreOutOf10 !== null ? `${s.scoreOutOf10}/10` : null,
      flag: null as string | null,
      at: s.createdAt,
    })),
    ...doneExams.map((e) => ({
      key: `e-${e.id}`,
      to: `/review/written/${e.id}`,
      title: e.title,
      meta: 'Written paper',
      score:
        e.totalAwarded !== null ? `${e.totalAwarded}/${e.totalMarks}` : null,
      flag:
        e.scriptAppearance && e.scriptAppearance !== 'handwritten'
          ? APPEARANCE_LABEL[e.scriptAppearance] || null
          : null,
      at: e.createdAt,
    })),
  ].sort((a, b) => (b.at || '').localeCompare(a.at || ''));

  return (
    <div className="page">
      <TopBar />

      <main className="container">
        <h2>Dashboard</h2>
        {error && <p className="error">{error}</p>}

        <div className="cards">
          <Link to="/exam" className="card clickable">
            <h3>Take my revision</h3>
            <p>
              An adaptive oral viva that probes your reasoning rather than
              testing recall.
            </p>
            <span className="btn">Start</span>
          </Link>

          <Link to="/written" className="card clickable">
            <h3>Take my written exam</h3>
            <p>
              Sit a generated paper on real paper, then have your handwriting
              marked against its rubric.
            </p>
            <span className="btn">Start</span>
          </Link>

          <Link to="/materials" className="card clickable">
            <h3>My materials</h3>
            <p>
              {count === null
                ? 'Manage your study sources.'
                : count === 0
                ? 'Upload your first study source to begin.'
                : `${count} material${count === 1 ? '' : 's'} ready to examine.`}
            </p>
            <span className="btn">Open</span>
          </Link>

          <Link to="/profile" className="card clickable">
            <h3>My learning profile</h3>
            <p>
              Strengths, gaps and recurring misconceptions across everything
              you've been assessed on.
            </p>
            <span className="btn">Open</span>
          </Link>
        </div>

        {loading && <Spinner label="Loading your work…" />}

        {hasOpen && (
          <section className="resume-block">
            <h3>Continue where you left off</h3>
            <div className="list">
              {openExams.map((e) => (
                <Link className="row linkrow" to="/written" key={e.id}>
                  <div className="row-main">
                    <div className="row-title">{e.title}</div>
                    <div className="muted small">
                      Paper set, waiting for your answers
                      {e.createdAt
                        ? ` · ${new Date(e.createdAt).toLocaleDateString()}`
                        : ''}
                    </div>
                  </div>
                  <span className="btn small">Continue</span>
                </Link>
              ))}
              {openSessions.map((s) => (
                <Link className="row linkrow" to="/exam" key={s.id}>
                  <div className="row-main">
                    <div className="row-title">{s.materialTitle}</div>
                    <div className="muted small">
                      Viva in progress · {s.questionsAsked} question
                      {s.questionsAsked === 1 ? '' : 's'} so far
                    </div>
                  </div>
                  <span className="btn small">Resume</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {history.length > 0 && (
          <section className="resume-block">
            <h3>Recent assessments</h3>
            <div className="list">
              {history.slice(0, 20).map((h) => (
                <Link className="row linkrow" to={h.to} key={h.key}>
                  <div className="row-main">
                    <div className="row-title">{h.title}</div>
                    <div className="muted small">
                      {h.meta}
                      {h.at ? ` · ${new Date(h.at).toLocaleDateString()}` : ''}
                    </div>
                    {h.flag && <span className="pill warn">{h.flag}</span>}
                  </div>
                  <div className="row-actions">
                    {h.score && <span className="pill ready">{h.score}</span>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {!loading && history.length === 0 && !hasOpen && (
          <div className="empty">
            <p className="muted">
              Nothing assessed yet. Upload a chapter, then let Reviso examine
              you on it.
            </p>
            <Link to="/materials" className="btn primary">
              Upload your first material
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
