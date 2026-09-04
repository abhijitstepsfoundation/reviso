import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import TopBar from '../components/TopBar';
import { api } from '../lib/api';
import { toBase64 } from '../lib/files';
import { Spinner, BusyOverlay } from '../components/Spinner';

interface Material {
  id: string;
  title: string;
  subject?: string;
  status: string;
  topics?: string[];
}

interface Question {
  number: number;
  marks: number;
  text: string;
  topic: string;
}

interface Paper {
  title: string;
  durationMinutes: number;
  totalMarks: number;
  instructions: string;
  questions: Question[];
}

interface QuestionResult {
  number: number;
  awarded: number;
  outOf: number;
  studentAnswerSummary: string;
  whatWasRight: string;
  whatWasMissing: string;
  misconception: string;
}

interface Result {
  transcriptionNotes: string;
  perQuestion: QuestionResult[];
  totalAwarded: number;
  totalOutOf: number;
  headline: string;
  gaps: string[];
  studyPlan: { topic: string; action: string; why: string }[];
}

type Phase = 'choose' | 'setting' | 'paper' | 'marking' | 'result';

const MAX_PAGES = 5;
const MAX_PAGE_BYTES = 4 * 1024 * 1024;

export default function Written() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>('choose');
  const [error, setError] = useState('');

  const [examId, setExamId] = useState('');
  const [paper, setPaper] = useState<Paper | null>(null);
  const [pages, setPages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState<any[]>([]);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      api<Material[]>('/materials').then((m) =>
        setMaterials(m.filter((x) => x.status === 'ready'))
      ),
      api<any[]>('/exams')
        .then((e) => setPending(e.filter((x) => x.status === 'ready')))
        .catch(() => setPending([])),
    ])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  /** Reopens a paper set earlier so answers can be uploaded any time later. */
  const resume = async (id: string) => {
    setError('');
    setPhase('setting');
    try {
      const r = await api(`/exams/${id}`);
      setExamId(r.id);
      setPaper(r.paper);
      setPages([]);
      setPhase('paper');
    } catch (e: any) {
      setError(e.message);
      setPhase('choose');
    }
  };

  useEffect(() => {
    const urls = pages.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [pages]);

  const setExam = async (materialId: string) => {
    setError('');
    setPhase('setting');
    try {
      const r = await api('/exams', {
        method: 'POST',
        body: JSON.stringify({ materialId }),
      });
      setExamId(r.id);
      setPaper(r.paper);
      setPages([]);
      setPhase('paper');
    } catch (e: any) {
      setError(e.message);
      setPhase('choose');
    }
  };

  const addPages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    if (fileRef.current) fileRef.current.value = '';
    if (picked.length === 0) return;

    setError('');

    const oversize = picked.find((f) => f.size > MAX_PAGE_BYTES);
    if (oversize) {
      setError(`"${oversize.name}" is over 4 MB. Photos from a phone are usually fine.`);
      return;
    }

    const combined = [...pages, ...picked].slice(0, MAX_PAGES);
    if (pages.length + picked.length > MAX_PAGES) {
      setError(`Only the first ${MAX_PAGES} pages will be marked.`);
    }
    setPages(combined);
  };

  const removePage = (i: number) => {
    setPages((prev) => prev.filter((_, idx) => idx !== i));
  };

  const submit = async () => {
    if (pages.length === 0) return;
    setError('');
    setPhase('marking');

    try {
      const encoded = await Promise.all(
        pages.map(async (f) => ({
          mimeType: f.type || 'image/jpeg',
          data: await toBase64(f),
        }))
      );

      const r = await api(`/exams/${examId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ pages: encoded }),
      });

      setResult(r.result);
      setPhase('result');
    } catch (e: any) {
      setError(e.message);
      setPhase('paper');
    }
  };

  const restart = () => {
    setPhase('choose');
    setPaper(null);
    setResult(null);
    setPages([]);
    setExamId('');
    setError('');
  };

  return (
    <div className="page">
      <TopBar back />

      <main className="container">
        {phase === 'choose' && (
          <>
            <h2>Take my written exam</h2>
            <p className="muted sub">
              Reviso sets a paper from your material. You answer it by hand on
              paper, photograph your answers, and get them marked against the
              paper's own rubric.
            </p>

            {error && <p className="error">{error}</p>}

            {!loading && pending.length > 0 && (
              <section className="resume-block">
                <h3>Papers waiting for your answers</h3>
                <p className="muted small">
                  These papers are already set. Write the answers whenever you
                  like, then come back and upload the photos.
                </p>
                <div className="list">
                  {pending.map((p) => (
                    <div className="row" key={p.id}>
                      <div className="row-main">
                        <div className="row-title">{p.title}</div>
                        <div className="muted small">
                          {p.totalMarks} marks
                          {p.durationMinutes ? ` · ${p.durationMinutes} min` : ''}
                          {p.createdAt
                            ? ` · set ${new Date(p.createdAt).toLocaleDateString()}`
                            : ''}
                        </div>
                      </div>
                      <div className="row-actions">
                        <button className="btn primary" onClick={() => resume(p.id)}>
                          Continue
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
                <p className="muted">You need a processed material first.</p>
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
                      <button className="btn primary" onClick={() => setExam(m.id)}>
                        Set my paper
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {phase === 'setting' && (
          <BusyOverlay label="Setting your paper. This takes about 20 seconds." />
        )}

        {(phase === 'paper' || phase === 'marking') && paper && (
          <>
            <div className="paper">
              <div className="paper-head">
                <h2>{paper.title}</h2>
                <div className="muted small">
                  {paper.totalMarks} marks · {paper.durationMinutes} minutes
                </div>
                <p className="muted small">{paper.instructions}</p>
              </div>

              {paper.questions.map((q) => (
                <div className="paper-q" key={q.number}>
                  <div className="paper-qnum">
                    {q.number}.<span className="marks">[{q.marks}]</span>
                  </div>
                  <div className="paper-qtext">{q.text}</div>
                </div>
              ))}
            </div>

            <div className="no-print">
              <button className="btn ghost" onClick={() => window.print()}>
                Print this paper
              </button>

              <div className="submit-block">
                <h3>Submit your answers</h3>
                <p className="muted small">
                  Write your answers on paper, then photograph each page.
                  Up to {MAX_PAGES} pages, 4 MB each. Number your answers so the
                  marker can match them to the questions.
                </p>

                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  multiple
                  onChange={addPages}
                  style={{ display: 'none' }}
                  id="pages-input"
                  disabled={phase === 'marking'}
                />
                <label htmlFor="pages-input" className="btn">
                  Add photos
                </label>

                {error && <p className="error">{error}</p>}

                {previews.length > 0 && (
                  <div className="thumbs">
                    {previews.map((src, i) => (
                      <div className="thumb" key={i}>
                        <img src={src} alt={`Page ${i + 1}`} />
                        <div className="thumb-bar">
                          <span className="muted small">Page {i + 1}</span>
                          {phase !== 'marking' && (
                            <button
                              className="btn ghost small danger"
                              onClick={() => removePage(i)}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="exam-actions">
                  <button
                    className="btn primary"
                    onClick={submit}
                    disabled={phase === 'marking' || pages.length === 0}
                  >
                    {phase === 'marking'
                      ? 'Marking your script…'
                      : `Submit ${pages.length || 'no'} page${
                          pages.length === 1 ? '' : 's'
                        } for marking`}
                  </button>
                  <button
                    className="btn ghost"
                    onClick={restart}
                    disabled={phase === 'marking'}
                  >
                    Start over
                  </button>
                </div>

                {phase === 'marking' && (
                  <BusyOverlay label="Reading your handwriting and marking against the rubric. This takes 20–40 seconds." />
                )}
              </div>
            </div>
          </>
        )}

        {phase === 'result' && result && (
          <>
            <h2>Your marked script</h2>

            <div className="score-card">
              <div className="score">
                {result.totalAwarded}
                <span>/{result.totalOutOf}</span>
              </div>
              <p className="headline">{result.headline}</p>
            </div>

            {result.transcriptionNotes && (
              <div className="notice">
                <strong>Reading your script: </strong>
                {result.transcriptionNotes}
              </div>
            )}

            <section className="report-block">
              <h3>Question by question</h3>
              {result.perQuestion.map((q) => (
                <div className="marked-q" key={q.number}>
                  <div className="marked-head">
                    <span className="marked-num">Question {q.number}</span>
                    <span className="pill ready">
                      {q.awarded}/{q.outOf}
                    </span>
                  </div>
                  {q.studentAnswerSummary && (
                    <p className="muted small">You wrote: {q.studentAnswerSummary}</p>
                  )}
                  {q.whatWasRight && (
                    <p>
                      <strong>Credit: </strong>
                      {q.whatWasRight}
                    </p>
                  )}
                  {q.whatWasMissing && (
                    <p>
                      <strong>Missing: </strong>
                      {q.whatWasMissing}
                    </p>
                  )}
                  {q.misconception && (
                    <p className="misconception">
                      <strong>Faulty reasoning: </strong>
                      {q.misconception}
                    </p>
                  )}
                </div>
              ))}
            </section>

            {!!result.gaps.length && (
              <section className="report-block">
                <h3>Gaps</h3>
                <ul>
                  {result.gaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </section>
            )}

            {!!result.studyPlan.length && (
              <section className="report-block">
                <h3>What to revise next</h3>
                {result.studyPlan.map((s, i) => (
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
                Set another paper
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
