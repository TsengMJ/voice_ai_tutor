import type { Correction, Mode, SessionState, Turn } from './domain.js';

export interface NewSession {
  id: string;
  learnerId: string;
  scenarioId: string;
  language: string;
  timezone: string;
  mode: Mode;
  now: number;
}

/** Hot conversation state for sessions that are in progress or recently ended. */
export interface SessionStore {
  create(input: NewSession): Promise<SessionState>;
  get(id: string): Promise<SessionState | null>;
  setMode(id: string, mode: Mode, now: number): Promise<void>;
  setRoom(id: string, roomName: string, now: number): Promise<void>;

  appendTurn(id: string, turn: Turn): Promise<void>;
  listTurns(id: string, limit?: number): Promise<Turn[]>;
  countTurns(id: string): Promise<number>;

  addCorrection(id: string, correction: Correction): Promise<void>;
  listCorrections(id: string): Promise<Correction[]>;

  /** Returns the full list of completed goal ids after the update. */
  completeGoal(id: string, goalId: string): Promise<string[]>;
  listGoals(id: string): Promise<string[]>;

  addVoiceMs(id: string, ms: number, now: number): Promise<void>;
  recordTextActivity(id: string, now: number): Promise<void>;
  recordLatency(id: string, ms: number): Promise<void>;

  end(id: string, now: number): Promise<SessionState | null>;

  setActiveSession(learnerId: string, sessionId: string): Promise<void>;
  getActiveSession(learnerId: string): Promise<string | null>;
  clearActiveSession(learnerId: string, sessionId: string): Promise<void>;
  listActiveSessionIds(): Promise<string[]>;

  markDirty(id: string): Promise<void>;
  takeDirty(max: number): Promise<string[]>;
}
