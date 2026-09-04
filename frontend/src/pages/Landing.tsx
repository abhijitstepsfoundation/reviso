import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Theme, initialTheme, applyTheme } from '../lib/theme';
import { Spinner } from '../components/Spinner';

export default function Landing() {
  const { user, signIn, loading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  const handle = async () => {
    setError('');
    setBusy(true);
    try {
      await signIn();
    } catch (e: any) {
      if (e?.code === 'auth/popup-closed-by-user') {
        setError('Sign-in was cancelled.');
      } else {
        setError('Sign-in failed. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="center">
        <Spinner label="Loading Reviso…" />
      </div>
    );
  }

  return (
    <div className="landing">
      <button
        className="icon-btn landing-theme"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        aria-label="Toggle dark mode"
      >
        {theme === 'dark' ? '☀' : '☾'}
      </button>

      <section className="hero">
        <div className="brand">Reviso</div>
        <h1>Find out what you actually understand</h1>
        <p className="lede">
          Most study tools explain things to you. Reviso examines you — on your
          own syllabus, textbook or notes — and tells you honestly where your
          understanding breaks down.
        </p>

        <button className="btn primary big" onClick={handle} disabled={busy}>
          {busy ? 'Opening Google…' : 'Continue with Google'}
        </button>
        {error && <p className="error">{error}</p>}
        <p className="muted small">Free to try. Your material stays private to your account.</p>
      </section>

      <section className="how">
        <h2>How it works</h2>
        <ol className="steps">
          <li>
            <strong>Upload a chapter.</strong> A textbook section, your own
            notes, a syllabus or a past paper. Reviso reads it and works out
            what it can examine.
          </li>
          <li>
            <strong>Get examined.</strong> Sit an adaptive oral viva, or a
            written paper you answer by hand and photograph.
          </li>
          <li>
            <strong>See where you stand.</strong> A profile that separates
            what you haven't learned yet from what you've learned wrong.
          </li>
        </ol>
      </section>

      <section className="features">
        <div className="feature">
          <h3>An examiner, not a tutor</h3>
          <p>
            When you answer wrongly, Reviso doesn't correct you — it probes.
            It asks what follows from what you just said. A student who gets
            told the answer stops revealing what they know.
          </p>
        </div>
        <div className="feature">
          <h3>Marked from your handwriting</h3>
          <p>
            Answer on real paper the way you will in the exam hall, photograph
            it, and get marks question by question against a rubric written
            for that paper.
          </p>
        </div>
        <div className="feature">
          <h3>Gaps versus misconceptions</h3>
          <p>
            A gap means you haven't learned it yet. A misconception means
            you've learned something wrong and it will keep costing you marks.
            Reviso only calls it the second when the same reasoning recurs.
          </p>
        </div>
        <div className="feature">
          <h3>Speaking versus writing</h3>
          <p>
            Do both and Reviso compares them. Better on paper than aloud often
            means memorised material that hasn't become flexible understanding.
          </p>
        </div>
      </section>

      <footer className="landing-foot muted small">
        Built with Google AI Studio, Gemini, Firebase and Cloud Run.
      </footer>
    </div>
  );
}
