import { z } from 'zod';
import type {
  Correction,
  CorrectionCategory,
  Mode,
  SessionStatus,
  SessionSummary,
  Turn,
} from './domain.js';
import { MODES } from './domain.js';
import type { Language } from './languages.js';
import { LANGUAGE_CODES } from './languages.js';
import type { Scenario } from './scenarios.js';

export const CreateSessionRequestSchema = z.object({
  scenarioId: z.string().min(1),
  language: z.enum(LANGUAGE_CODES),
  mode: z.enum(MODES).default('voice'),
  timezone: z.string().min(1).max(64).default('UTC'),
});
export type CreateSessionRequest = z.input<typeof CreateSessionRequestSchema>;

export const ConnectionRequestSchema = z.object({ mode: z.enum(MODES) });

export interface Catalog {
  scenarios: Scenario[];
  languages: Language[];
}

export interface Me {
  learnerId: string;
  isDemo: boolean;
  activeSessionId: string | null;
}

export interface SessionView {
  id: string;
  scenarioId: string;
  language: string;
  mode: Mode;
  status: SessionStatus;
  startedAt: number;
  endedAt: number | null;
  voiceMs: number;
  textMs: number;
  turnCount: number;
  completedGoals: string[];
  avgLatencyMs: number | null;
  remainingMs: number;
}

export interface SessionReview {
  session: SessionView;
  turns: Turn[];
  corrections: Correction[];
  summary: SessionSummary | null;
}

export interface ConnectionDetails {
  serverUrl: string;
  roomName: string;
  token: string;
  remainingMs: number;
}

export interface Hint {
  suggestion: string;
  translation: string;
}

export interface DailyPoint {
  day: string;
  practiceMs: number;
  sessions: number;
}

export interface RecentSession {
  id: string;
  scenarioId: string;
  language: string;
  status: SessionStatus;
  startedAt: number;
  practiceMs: number;
  turnCount: number;
  goalsCompleted: number;
}

export interface DashboardData {
  isDemo: boolean;
  totals: {
    sessions: number;
    practiceMs: number;
    voiceMs: number;
    textMs: number;
    turns: number;
    goals: number;
    corrections: number;
  };
  todayMs: number;
  weekMs: number;
  streakDays: number;
  avgLatencyMs: number | null;
  last7Days: DailyPoint[];
  topMistakes: { category: CorrectionCategory; count: number }[];
  recent: RecentSession[];
  activeSessionId: string | null;
}
