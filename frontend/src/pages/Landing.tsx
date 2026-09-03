import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Landing() {
  const { user, signIn, loading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  const handle = async () => {
    setError('');
    setBusy(true);
    try {
      await signIn();
    } catch (e: any) {
      setError(e?.message || 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="center muted">Loading…</div>;

  return (
    <div className="landing">
      <div className="landing-inner">
        <div className="brand">Reviso</div>
        <h1>Your Personal AI Examiner</h1>
        <p className="lede">
          Upload what you're studying. Let AI examine what you actually
          understand — then find out exactly what to revise next.
        </p>
        <button className="btn primary" onClick={handle} disabled={busy}>
          {busy ? 'Opening Google…' : 'Continue with Google'}
        </button>
        {error && <p className="error">{error}</p>}
        <ul className="points">
          <li>An adaptive oral viva that probes your reasoning, not just your recall</li>
          <li>A written exam you answer by hand, graded from a photograph</li>
          <li>A learning profile that shows where your understanding breaks down</li>
        </ul>
      </div>
    </div>
  );
}
