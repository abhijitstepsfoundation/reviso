import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import TopBar from '../components/TopBar';
import { api } from '../lib/api';
import { speechSupported, createRecogniser } from '../lib/speech';
import { Spinner, BusyOverlay } from '../components/Spinner';

interface Material {
  id: string;
  title: string;
  subject?: string;
  status: string;
  topics?: string[];
}

interface StudyPlanItem {
  topic: string;
  action: string;
  why: string;
}

interface Report {
  headline: string;
  strengths: string[];
  gaps: string[];
  misconceptions: string[];
  responseObservations: string;
  studyPlan: StudyPlanItem[];
  scoreOutOf10: number;
}

type Phase = 'choose' | 'asking' | 'thinking' | 'done';

export default function Exam() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [phase, setPhase] = useState<Phase>('choose');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [sessionId, setSessionId] = useState('');
  const [materialTitle, setMaterialTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [topic, setTopic] = useState('');
  const [questionType, setQuestionType] = useState('');
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(6);

  const [answer, setAnswer] = useState('');
  const [listening, setListening] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [unfinished, setUnfinished] = useState<any[]>([]);

  const askedAt = useRef<number>(0);
  const recogniser = useRef<any>(null);
  const interimBase = useRef<string>('');

  useEffect(() => {
    Promise.all([
      api<Material[]>('/materials').then((m) =>
        setMaterials(m.filter((x) => x.status === 'ready'))
      ),
      api<any[]>('/sessions')
        .then((s) => setUnfinished(s.filter((x) => x.status === 'active')))
        .catch(() => setUnfinished([])),
    ])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  /** Reopens a viva that was left part-way through. */
  const resume = async (id: string) => {
    setError('');
    setPhase('thinking');
    try {
      const s = await api(`/sessions/${id}`);
      const turns = s.turns || [];
      const open = turns[turns.length - 1];
      if (!open || open.answer !== undefined) {
        setError('That session has no open question. Start a new one.');
        setPhase('choose');
        return;
      }
      setSessionId(s.id);
      setMaterialTitle(s.materialTitle);
      setQuestion(open.question);
      setTopic(open.topic);
      setQuestionType(open.questionType);
      setIndex(open.index);
      setAnswer('');
      setPhase('asking');
    } catch (e: any) {
      setError(e.message);
      setPhase('choose');
    }
  };

  // The clock starts when the question appears, not when typing begins.
  useEffect(() => {
    if (phase === 'asking') askedAt.current = Date.now();
  }, [question, phase]);

  const stopListening = () => {
    if (recogniser.current) {
      try {
        recogniser.current.stop();
      } catch {
        /* already stopped */
      }
    }
    setListening(false);
  };

  const toggleListening = () => {
    if (listening) {
      stopListening();
      return;
    }

    interimBase.current = answer ? answer + ' ' : '';
    const rec = createRecogniser(
      (text, isFinal) => {
        if (isFinal) {
          interimBase.current = (interimBase.current + text).trim() + ' ';
          setAnswer(interimBase.current.trim());
        } else {
          setAnswer((interimBase.current + text).trim());
        }
      },
      () => setListening(false),
      (msg) => {
        setError(msg);
        setListening(false);
      }
    );

    if (!rec) {
      setError('Speech input is not available in this browser. Please type instead.');
      return;
    }

    recogniser.current = rec;
    setError('');
    setListening(true);
    rec.start();
  };

  const start = async (materialId: string) => {
    setError('');
    setPhase('thinking');
    try {
      const r = await api('/sessions', {
        method: 'POST',
        body: JSON.stringify({ materialId }),
      });
      setSessionId(r.sessionId);
      setMaterialTitle(r.materialTitle);
      setQuestion(r.question);
      setTopic(r.topic);
      setQuestionType(r.questionType);
      setIndex(r.index);
      setTotal(r.total);
      setAnswer('');
      setPhase('asking');
    } catch (e: any) {
      setError(e.message);
      setPhase('choose');
    }
  };

  const submit = async () => {
    const responseMs = Date.now() - askedAt.current;
    stopListening();
    setError('');
    setPhase('thinking');

    try {
      const r = await api(`/sessions/${sessionId}/answer`, {
        method: 'POST',
        body: JSON.stringify({ answer: answer.trim(), responseMs }),
      });

      if (r.done) {
        setReport(r.report);
        setPhase('done');
        return;
      }

      setQuestion(r.question);
      setTopic(r.topic);
      setQuestionType(r.questionType);
      setIndex(r.index);
      setAnswer('');
      setPhase('asking');
    } catch (e: any) {
      setError(e.message);
      setPhase('asking');
    }
  };

  const restart = () => {
    setPhase('choose');
    setReport(null);
    setSessionId('');
    setAnswer('');
    setError('');
  };

  return (
    <div className="page">
      <TopBar back />

      <main className="container">
        {phase === 'choose' && (
          <>
            <h2>Take my revision</h2>
            <p className="muted sub">
              Your examiner will ask up to six questions, one at a time, and
              decide what to ask next based on how you answer. It won't tell you
              the answers during the exam.
            </p>

            {error && <p className="error">{error}</p>}

            {!loading && unfinished.length > 0 && (
              <section className="resume-block">
                <h3>Unfinished vivas</h3>
                <p className="muted small">
                  Pick up where you stopped. Your earlier answers are kept.
                </p>
                <div className="list">
                  {unfinished.map((s) => (
                    <div className="row" key={s.id}>
                      <div className="row-main">
                        <div className="row-title">{s.materialTitle}</div>
                        <div className="muted small">
                          {s.questionsAsked} question
                          {s.questionsAsked === 1 ? '' : 's'} so far
                          {s.createdAt
                            ? ` · started ${new Date(s.createdAt).toLocaleDateString()}`
                            : ''}
                        </div>
                      </div>
                      <div className="row-actions">
                        <button className="btn primary" onClick={() => resume(s.id)}>
                          Resume
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {loading ? (
              <Spinner label="Loading your materials…" />
            ) : materials.length === 0 ? (
              <div className="empty">
                <p className="muted">
                  You need a processed material first.
                </p>
                <Link to="/materials" className="btn primary">
                  Upload material
                </Link>
              </div>
            ) : (
              <div className="list">
                {materials.map((m) => (
                  <div className="row" key={m.id}>
                    <div className="row-main">
                      <div className="row-title">{m.title}</div>
                      <div className="muted small">
                        {m.subject}
                        {m.topics?.length ? ` · ${m.topics.length} topics` : ''}
                      </div>
                    </div>
                    <div className="row-actions">
                      <button className="btn primary" onClick={() => start(m.id)}>
                        Examine me
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {(phase === 'asking' || (phase === 'thinking' && sessionId)) && !report && (
          <>
            <div className="exam-head">
              <div className="muted small">{materialTitle}</div>
              <div className="muted small">
                Question {index + 1} of {total}
              </div>
            </div>

            <div className="progress">
              <div
                className="progress-fill"
                style={{ width: `${((index + 1) / total) * 100}%` }}
              />
            </div>

            <div className="question-card">
              <div className="qmeta">
                <span className="tag subtle">{questionType}</span>
                {topic && <span className="muted small">{topic}</span>}
              </div>
              <p className="question">{question}</p>
            </div>

            {error && <p className="error">{error}</p>}

            <textarea
              className="answer"
              rows={6}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && answer.trim()) {
                  submit();
                }
              }}
              placeholder="Answer in your own words. Say what you actually think, not what sounds right."
              disabled={phase === 'thinking'}
            />

            <div className="exam-actions">
              <button
                className="btn primary"
                onClick={submit}
                disabled={phase === 'thinking' || !answer.trim()}
              >
                {phase === 'thinking' ? 'Examiner is considering…' : 'Submit answer'}
              </button>

              {speechSupported() && (
                <button
                  className={`btn ${listening ? 'danger' : 'ghost'}`}
                  onClick={toggleListening}
                  disabled={phase === 'thinking'}
                >
                  {listening ? 'Stop speaking' : 'Answer aloud'}
                </button>
              )}

              <button
                className="btn ghost small"
                onClick={submit}
                disabled={phase === 'thinking'}
                title="Submit without an answer"
              >
                I don't know
              </button>
            </div>

            <p className="muted small hint">
              Ctrl+Enter submits. Speaking uses your browser's own speech
              recognition — nothing is recorded or uploaded, and the text stays
              in the box until you submit.
            </p>
          </>
        )}

        {phase === 'thinking' && !sessionId && (
          <BusyOverlay label="Preparing your examiner…" />
        )}

        {phase === 'done' && report && (
          <>
            <h2>Your report</h2>
            <p className="muted sub">{materialTitle}</p>

            <div className="score-card">
              <div className="score">{report.scoreOutOf10}<span>/10</span></div>
              <p className="headline">{report.headline}</p>
            </div>

            {!!report.strengths.length && (
              <section className="report-block">
                <h3>What you showed you understand</h3>
                <ul>
                  {report.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </section>
            )}

            {!!report.gaps.length && (
              <section className="report-block">
                <h3>Gaps</h3>
                <ul>
                  {report.gaps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </section>
            )}

            {!!report.misconceptions.length && (
              <section className="report-block">
                <h3>Recurring misconceptions</h3>
                <p className="muted small">
                  These appeared more than once, so they are reasoning patterns
                  rather than one-off slips.
                </p>
                <ul>
                  {report.misconceptions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </section>
            )}

            {report.responseObservations && (
              <section className="report-block">
                <h3>How you answered</h3>
                <p>{report.responseObservations}</p>
              </section>
            )}

            {!!report.studyPlan.length && (
              <section className="report-block">
                <h3>What to revise next</h3>
                {report.studyPlan.map((s, i) => (
                  <div className="plan-item" key={i}>
                    <div className="plan-topic">{s.topic}</div>
                    <div>{s.action}</div>
                    <div className="muted small">{s.why}</div>
                  </div>
                ))}
              </section>
            )}

            <div className="exam-actions">
              <button className="btn primary" onClick={restart}>
                Examine me again
              </button>
              <Link to="/dashboard" className="btn ghost">
                Back to dashboard
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
