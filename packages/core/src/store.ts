import type { ABNORMAL_CLIENT_DISCONNECT, Correction, Mode, SessionState, Turn } from './domain.js';

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
  /** Turns from list index `start` (the transcript sequence number) to the end. */
  listTurnsFrom(id: string, start: number): Promise<Turn[]>;
  countTurns(id: string): Promise<number>;

  addCorrection(id: string, correction: Correction): Promise<void>;
  listCorrections(id: string): Promise<Correction[]>;

  /** Returns the full list of completed goal ids after the update. */
  completeGoal(id: string, goalId: string): Promise<string[]>;
  listGoals(id: string): Promise<string[]>;

  addVoiceMs(id: string, ms: number, now: number): Promise<void>;
  recordTextActivity(id: string, now: number): Promise<void>;
  recordLatency(id: string, ms: number): Promise<void>;

  /** Marks an active session for the flusher to end after the reconnect grace expires. */
  setEndReason(id: string, reason: typeof ABNORMAL_CLIENT_DISCONNECT): Promise<void>;

  end(id: string, now: number): Promise<SessionState | null>;

  setActiveSession(learnerId: string, sessionId: string): Promise<void>;
  getActiveSession(learnerId: string): Promise<string | null>;
  clearActiveSession(learnerId: string, sessionId: string): Promise<void>;
  listActiveSessionIds(): Promise<string[]>;

  markDirty(id: string): Promise<void>;
  /** Moves up to `max` dirty ids into a claimed set stamped with `now`, and returns them. */
  takeDirty(max: number, now: number): Promise<string[]>;
  /** Drops the claim once the session was flushed or re-marked dirty. */
  ackDirty(id: string): Promise<void>;
  /** Returns claims made at or before `cutoff` to the dirty set; resolves to how many moved. */
  requeueStaleClaims(cutoff: number): Promise<number>;
}
