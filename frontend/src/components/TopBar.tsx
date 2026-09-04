import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Theme, initialTheme, applyTheme } from '../lib/theme';

interface Props {
  /** Inner pages show a back link instead of the account controls. */
  back?: boolean;
  backTo?: string;
  backLabel?: string;
}

export default function TopBar({
  back = false,
  backTo = '/dashboard',
  backLabel = 'Back',
}: Props) {
  const { user, signOutUser } = useAuth();
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return (
    <header className="topbar no-print">
      <Link to={user ? '/dashboard' : '/'} className="brand small link">
        Reviso
      </Link>

      <div className="topbar-right">
        <button
          className="icon-btn"
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>

        {back ? (
          <Link to={backTo} className="btn ghost">
            {backLabel}
          </Link>
        ) : user ? (
          <>
            <span className="muted hide-mobile">{user.displayName}</span>
            <button className="btn ghost" onClick={signOutUser}>
              Sign out
            </button>
          </>
        ) : null}
      </div>
    </header>
  );
}
