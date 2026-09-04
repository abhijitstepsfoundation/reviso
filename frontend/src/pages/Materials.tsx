import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import TopBar from '../components/TopBar';
import { api, apiUpload } from '../lib/api';

interface Material {
  id: string;
  title: string;
  fileName: string;
  subject?: string;
  summary?: string;
  topics?: string[];
  keyConcepts?: string[];
  status: 'processing' | 'ready' | 'failed';
  error?: string;
  sizeBytes?: number;
  pageCount?: number;
}

const MAX_BYTES = 10 * 1024 * 1024;

export default function Materials() {
  const [items, setItems] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      setItems(await api<Material[]>('/materials'));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const reset = () => {
    if (fileRef.current) fileRef.current.value = '';
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');

    // Fail fast in the browser so a large file is never uploaded at all.
    if (file.size > MAX_BYTES) {
      setError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 10 MB.`
      );
      reset();
      return;
    }

    setUploading(true);
    try {
      await apiUpload('/materials', file);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      reset();
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this material and its file?')) return;
    try {
      await api(`/materials/${id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((m) => m.id !== id));
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="page">
      <TopBar back />

      <main className="container">
        <h2>My materials</h2>
        <p className="muted sub">
          Upload one chapter at a time: a textbook section, your notes, a
          syllabus or a question paper. Reviso reads it and works out what it
          can examine you on.
        </p>

        <div className="uploader">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.md"
            onChange={onPick}
            disabled={uploading}
            style={{ display: 'none' }}
            id="file-input"
          />
          <label htmlFor="file-input" className="btn primary">
            {uploading ? 'Reading your material…' : 'Upload material'}
          </label>
          <span className="muted small">
            PDF, JPG, PNG or text · up to 10 MB · up to 20 pages
          </span>
        </div>

        {uploading && (
          <p className="muted small">
            This takes 15–30 seconds. Gemini is transcribing the content and
            identifying topics.
          </p>
        )}
        {error && <p className="error">{error}</p>}

        {loading ? (
          <p className="muted">Loading…</p>
        ) : items.length === 0 ? (
          <div className="empty">
            <p className="muted">No materials yet. Upload one to get started.</p>
          </div>
        ) : (
          <div className="list">
            {items.map((m) => (
              <div className="row" key={m.id}>
                <div className="row-main">
                  <div className="row-title">
                    {m.title}
                    <span className={`pill ${m.status}`}>{m.status}</span>
                  </div>
                  <div className="muted small">
                    {m.fileName}
                    {m.subject ? ` · ${m.subject}` : ''}
                    {m.pageCount ? ` · ${m.pageCount} pages` : ''}
                    {m.topics?.length ? ` · ${m.topics.length} topics` : ''}
                  </div>
                  {m.status === 'failed' && (
                    <div className="error small">{m.error}</div>
                  )}

                  {open === m.id && m.status === 'ready' && (
                    <div className="detail">
                      <p>{m.summary}</p>
                      {!!m.topics?.length && (
                        <>
                          <div className="label">Topics</div>
                          <div className="tags">
                            {m.topics.map((t) => (
                              <span className="tag" key={t}>
                                {t}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                      {!!m.keyConcepts?.length && (
                        <>
                          <div className="label">Key concepts</div>
                          <div className="tags">
                            {m.keyConcepts.map((t) => (
                              <span className="tag subtle" key={t}>
                                {t}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="row-actions">
                  {m.status === 'ready' && (
                    <button
                      className="btn ghost small"
                      onClick={() => setOpen(open === m.id ? null : m.id)}
                    >
                      {open === m.id ? 'Hide' : 'View'}
                    </button>
                  )}
                  <button
                    className="btn ghost small danger"
                    onClick={() => remove(m.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
