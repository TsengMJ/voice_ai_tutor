import { NavLink, Outlet, useMatch } from 'react-router-dom';
import { cx } from './ui';

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 64 64" className="size-8" aria-hidden>
        <rect width="64" height="64" rx="16" fill="#1F1B16" />
        <path
          d="M18 40c0-9 6-16 14-16s14 7 14 16"
          fill="none"
          stroke="#E8603C"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <circle cx="32" cy="42" r="5" fill="#F6F1E7" />
      </svg>
      <span className="font-display text-2xl font-semibold tracking-tight">Parla</span>
    </span>
  );
}

const navItem = ({ isActive }: { isActive: boolean }) =>
  cx(
    'rounded-full px-4 py-2 text-sm font-semibold transition-colors',
    isActive ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-paper-deep',
  );

export function Layout() {
  const inSession = useMatch('/practice/:id') !== null;
  return (
    <div className={inSession ? 'flex h-dvh flex-col' : 'min-h-dvh'}>
      <header className="sticky top-0 z-20 shrink-0 border-b border-line/70 bg-paper/80 backdrop-blur">
        <div
          className={cx(
            'mx-auto flex h-16 items-center justify-between',
            inSession ? 'max-w-[90rem] px-3 md:px-5' : 'max-w-6xl px-5',
          )}
        >
          <NavLink to="/" aria-label="Parla home">
            <Wordmark />
          </NavLink>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navItem}>
              Dashboard
            </NavLink>
            <NavLink to="/practice" className={navItem}>
              Practice
            </NavLink>
          </nav>
        </div>
      </header>
      <main
        className={
          inSession
            ? 'mx-auto min-h-0 w-full max-w-[90rem] flex-1 overflow-y-auto px-3 py-3 md:px-5 md:py-4'
            : 'mx-auto max-w-6xl px-5 py-8 md:py-12'
        }
      >
        <Outlet />
      </main>
    </div>
  );
}
