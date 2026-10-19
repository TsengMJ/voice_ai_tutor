import { z } from 'zod';

export const MODES = ['voice', 'text'] as const;
export type Mode = (typeof MODES)[number];

export const ROLES = ['learner', 'tutor'] as const;
export type Role = (typeof ROLES)[number];

export const CORRECTION_CATEGORIES = [
  'grammar',
  'vocabulary',
  'tense',
  'word_order',
  'register',
  'pronunciation',
  'other',
] as const;
export type CorrectionCategory = (typeof CORRECTION_CATEGORIES)[number];

export const SESSION_STATUSES = ['active', 'ended'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const LIMITS = {
  maxSessionMs: 10 * 60_000,
  maxTextLength: 500,
  contextTurns: 20,
  sessionTtlSeconds: 24 * 60 * 60,
  textGapCapMs: 60_000,
  textBurstStartMs: 15_000,
  staleSessionMs: 15 * 60_000,
} as const;

export const TurnSchema = z.object({
  id: z.string().min(1),
  role: z.enum(ROLES),
  modality: z.enum(MODES),
  text: z.string(),
  interrupted: z.boolean(),
  ts: z.number().int(),
});
export type Turn = z.infer<typeof TurnSchema>;

export const CorrectionSchema = z.object({
  id: z.string().min(1),
  original: z.string().min(1).max(300),
  corrected: z.string().min(1).max(300),
  explanation: z.string().min(1).max(400),
  category: z.enum(CORRECTION_CATEGORIES),
  ts: z.number().int(),
});
export type Correction = z.infer<typeof CorrectionSchema>;

export const SessionStateSchema = z.object({
  id: z.uuid(),
  learnerId: z.uuid(),
  scenarioId: z.string(),
  language: z.string(),
  timezone: z.string(),
  mode: z.enum(MODES),
  status: z.enum(SESSION_STATUSES),
  roomName: z.string(),
  startedAt: z.number().int(),
  endedAt: z.number().int().nullable(),
  lastActiveAt: z.number().int(),
  lastTextAt: z.number().int().nullable(),
  voiceMs: z.number().int().nonnegative(),
  textMs: z.number().int().nonnegative(),
  latencySumMs: z.number().int().nonnegative(),
  latencyCount: z.number().int().nonnegative(),
});
export type SessionState = z.infer<typeof SessionStateSchema>;

export interface SessionSummary {
  headline: string;
  strengths: string[];
  focus: { title: string; tip: string }[];
  source: 'model' | 'fallback';
}

export function averageLatencyMs(session: Pick<SessionState, 'latencySumMs' | 'latencyCount'>) {
  if (session.latencyCount === 0) return null;
  return Math.round(session.latencySumMs / session.latencyCount);
}
