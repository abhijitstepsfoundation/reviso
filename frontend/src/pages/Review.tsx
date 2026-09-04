import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import TopBar from '../components/TopBar';
import { api } from '../lib/api';
import { Spinner } from '../components/Spinner';

const APPEARANCE_LABEL: Record<string, string> = {
  handwritten: 'Handwritten',
  printed: 'Printed, not handwritten',
  mixed: 'Partly handwritten',
  unclear: 'Format unclear',
};

export default function Review() {
  const { type, id } = useParams();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const isOral = type === 'oral';

  useEffect(() => {
    const path = isOral ? `/sessions/${id}` : `/exams/${id}`;
    api(path)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [type, id, isOral]);

  return (
    <div className="page">
      <TopBar back />

      <main className="container">
        {loading && <Spinner label="Loading your assessment…" />}
        {error && <p className="error">{error}</p>}

        {data && isOral && <OralReview data={data} />}
        {data && !isOral && <WrittenReview data={data} />}
      </main>
    </div>
  );
}

function OralReview({ data }: { data: any }) {
  const report = data.report;
  const turns = data.turns || [];

  return (
    <>
      <h2>{data.materialTitle}</h2>
      <p className="muted sub">
        Oral viva · {turns.length} question{turns.length === 1 ? '' : 's'}
        {data.createdAt ? ` · ${new Date(data.createdAt).toLocaleString()}` : ''}
      </p>

      {report && (
        <div className="score-card">
          <div className="score">
            {report.scoreOutOf10}
            <span>/10</span>
          </div>
          <p className="headline">{report.headline}</p>
        </div>
      )}

      <section className="report-block">
        <h3>The exam</h3>
        {turns.map((t: any, i: number) => (
          <div className="turn" key={i}>
            <div className="turn-head">
              <span className="tag subtle">{t.questionType}</span>
              {t.topic && <span className="muted small">{t.topic}</span>}
              {t.correctness && (
                <span className={`pill ${verdictClass(t.correctness)}`}>
                  {t.correctness.replace('_', ' ')}
                </span>
              )}
            </div>
            <p className="turn-q">{t.question}</p>
            <div className="turn-a">
              {t.answer ? t.answer : <span className="muted">No answer given</span>}
            </div>
            <div className="turn-meta muted small">
              {t.responseMs ? `Answered in ${Math.round(t.responseMs / 1000)}s` : ''}
              {t.observed ? ` · ${t.observed}` : ''}
            </div>
          </div>
        ))}
      </section>

      {report && <ReportSections report={report} />}
    </>
  );
}

function WrittenReview({ data }: { data: any }) {
  const result = data.result;
  const paper = data.paper;

  if (!result) {
    return (
      <>
        <h2>{paper?.title || data.materialTitle}</h2>
        <p className="muted sub">This paper has not been marked yet.</p>
        <Link to="/written" className="btn primary">
          Upload your answers
        </Link>
      </>
    );
  }

  const byNumber = (n: number) =>
    result.perQuestion.find((q: any) => q.number === n);

  return (
    <>
      <h2>{paper?.title || data.materialTitle}</h2>
      <p className="muted sub">
        Written paper
        {data.createdAt ? ` · ${new Date(data.createdAt).toLocaleString()}` : ''}
      </p>

      <div className="score-card">
        <div className="score">
          {result.totalAwarded}
          <span>/{result.totalOutOf}</span>
        </div>
        <div>
          <p className="headline">{result.headline}</p>
          {result.scriptAppearance && result.scriptAppearance !== 'handwritten' && (
            <span className="pill warn">
              {APPEARANCE_LABEL[result.scriptAppearance]}
            </span>
          )}
        </div>
      </div>

      {result.scriptAppearance && result.scriptAppearance !== 'handwritten' && (
        <div className="notice">
          <strong>Note on your script: </strong>
          {result.scriptAppearanceNote ||
            'These answers do not appear to be handwritten.'}{' '}
          Marking was unaffected, but writing by hand is closer to real exam
          conditions and is what Reviso is built for.
        </div>
      )}

      {result.transcriptionNotes && (
        <div className="notice">
          <strong>Reading your script: </strong>
          {result.transcriptionNotes}
        </div>
      )}

      <section className="report-block">
        <h3>The paper, marked</h3>
        {paper?.questions?.map((q: any) => {
          const r = byNumber(q.number);
          return (
            <div className="marked-q" key={q.number}>
              <div className="marked-head">
                <span className="marked-num">Question {q.number}</span>
                {r && (
                  <span className="pill ready">
                    {r.awarded}/{r.outOf}
                  </span>
                )}
              </div>
              <p className="turn-q">{q.text}</p>

              {r?.studentAnswerSummary && (
                <p className="muted small">You wrote: {r.studentAnswerSummary}</p>
              )}
              {r?.whatWasRight && (
                <p>
                  <strong>Credit: </strong>
                  {r.whatWasRight}
                </p>
              )}
              {r?.whatWasMissing && (
                <p>
                  <strong>Missing: </strong>
                  {r.whatWasMissing}
                </p>
              )}
              {r?.misconception && (
                <p className="misconception">
                  <strong>Faulty reasoning: </strong>
                  {r.misconception}
                </p>
              )}

              {!!q.markingPoints?.length && (
                <details className="rubric">
                  <summary>What a full-mark answer needed</summary>
                  <ul>
                    {q.markingPoints.map((m: string, i: number) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </section>

      <ReportSections report={result} />
    </>
  );
}

function ReportSections({ report }: { report: any }) {
  return (
    <>
      {!!report.strengths?.length && (
        <section className="report-block">
          <h3>What you showed you understand</h3>
          <ul>
            {report.strengths.map((s: string, i: number) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      {!!report.gaps?.length && (
        <section className="report-block">
          <h3>Gaps</h3>
          <ul>
            {report.gaps.map((s: string, i: number) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      {!!report.misconceptions?.length && (
        <section className="report-block">
          <h3>Recurring misconceptions</h3>
          <ul>
            {report.misconceptions.map((s: string, i: number) => (
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

      {!!report.studyPlan?.length && (
        <section className="report-block">
          <h3>What to revise next</h3>
          {report.studyPlan.map((s: any, i: number) => (
            <div className="plan-item" key={i}>
              <div className="plan-topic">{s.topic}</div>
              <div>{s.action}</div>
              <div className="muted small">{s.why}</div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function verdictClass(v: string): string {
  if (v === 'correct') return 'ready';
  if (v === 'incorrect' || v === 'no_answer') return 'failed';
  return 'processing';
}
