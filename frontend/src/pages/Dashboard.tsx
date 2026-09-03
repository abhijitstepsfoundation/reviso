import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';

interface Me {
  uid: string;
  displayName?: string;
  email?: string;
}

export default function Dashboard() {
  const { user, signOutUser } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState('');
  const [diag, setDiag] = useState<string>('');

  useEffect(() => {
    api<Me>('/me')
      .then(setMe)
      .catch((e) => setError(e.message));
  }, []);

  const testGemini = async () => {
    setDiag('Checking…');
    try {
      const r = await api('/diag/gemini');
      setDiag(`${r.model}: ${r.reply}`);
    } catch (e: any) {
      setDiag(`Failed: ${e.message}`);
    }
  };

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand small">Reviso</div>
        <div className="topbar-right">
          <span className="muted">{user?.displayName || me?.displayName}</span>
          <button className="btn ghost" onClick={signOutUser}>
            Sign out
          </button>
        </div>
      </header>

      <main className="container">
        <h2>Dashboard</h2>
        {error && <p className="error">{error}</p>}

        <div className="cards">
          <div className="card">
            <h3>Take my revision</h3>
            <p>Talk through your material with your AI examiner.</p>
            <button className="btn" disabled>
              Coming in block 3
            </button>
          </div>
          <div className="card">
            <h3>Take my written exam</h3>
            <p>Generate an exam and upload your handwritten answers.</p>
            <button className="btn" disabled>
              Coming in block 4
            </button>
          </div>
          <div className="card">
            <h3>My learning profile</h3>
            <p>See strengths, gaps and recurring misconceptions.</p>
            <button className="btn" disabled>
              Coming in block 5
            </button>
          </div>
          <div className="card">
            <h3>My materials</h3>
            <p>Manage your study sources.</p>
            <button className="btn" disabled>
              Coming in block 2
            </button>
          </div>
        </div>

        <section className="diag">
          <h3>System check</h3>
          <p className="muted">
            Confirms Secret Manager and Gemini are reachable from the backend.
          </p>
          <button className="btn ghost" onClick={testGemini}>
            Test Gemini connection
          </button>
          {diag && <pre className="pre">{diag}</pre>}
        </section>
      </main>
    </div>
  );
}
