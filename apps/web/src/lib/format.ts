import { LANGUAGES, findScenario } from '@tutor/core/browser';

export function minutes(ms: number): number {
  return Math.round(ms / 60_000);
}

export function formatMinutes(ms: number): string {
  const m = minutes(ms);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatDay(epochMs: number): string {
  const date = new Date(epochMs);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function weekdayLabel(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
}

export function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

export function scenarioTitle(id: string): string {
  return findScenario(id)?.title ?? id;
}

export function categoryLabel(category: string): string {
  const label = category.replace('_', ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 5) return 'Up late';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
