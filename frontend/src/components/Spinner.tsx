export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner-row" role="status" aria-live="polite">
      <span className="spinner" />
      {label && <span className="muted">{label}</span>}
    </div>
  );
}

/** Full-screen busy state for actions that block the whole page. */
export function BusyOverlay({ label }: { label: string }) {
  return (
    <div className="busy-overlay" role="status" aria-live="assertive">
      <div className="busy-card">
        <span className="spinner large" />
        <p>{label}</p>
      </div>
    </div>
  );
}
