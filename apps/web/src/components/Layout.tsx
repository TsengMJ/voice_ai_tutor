import { NavLink, Outlet } from 'react-router-dom';
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
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-paper/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
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
      <main className="mx-auto max-w-6xl px-5 py-8 md:py-12">
        <Outlet />
      </main>
    </div>
  );
}
