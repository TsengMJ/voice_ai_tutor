import type { Correction, Mode, SessionState, Turn } from './domain.js';
import type { NewSession, SessionStore } from './store.js';
import { textActivityIncrementMs } from './timing.js';

/** In-process SessionStore for unit tests; mirrors RedisSessionStore semantics. */
export class InMemorySessionStore implements SessionStore {
  readonly sessions = new Map<string, SessionState>();
  readonly turns = new Map<string, Turn[]>();
  readonly corrections = new Map<string, Correction[]>();
  readonly goals = new Map<string, Set<string>>();
  readonly active = new Map<string, string>();
  readonly dirty = new Set<string>();

  private mutate(id: string, patch: Partial<SessionState>) {
    const session = this.sessions.get(id);
    if (session) this.sessions.set(id, { ...session, ...patch });
    this.dirty.add(id);
  }

  async create(input: NewSession): Promise<SessionState> {
    const session: SessionState = {
      id: input.id,
      learnerId: input.learnerId,
      scenarioId: input.scenarioId,
      language: input.language,
      timezone: input.timezone,
      mode: input.mode,
      status: 'active',
      roomName: '',
      startedAt: input.now,
      endedAt: null,
      lastActiveAt: input.now,
      lastTextAt: null,
      voiceMs: 0,
      textMs: 0,
      latencySumMs: 0,
      latencyCount: 0,
    };
    this.sessions.set(input.id, session);
    this.dirty.add(input.id);
    return session;
  }

  async get(id: string) {
    return this.sessions.get(id) ?? null;
  }

  async setMode(id: string, mode: Mode, now: number) {
    this.mutate(id, { mode, lastActiveAt: now });
  }

  async setRoom(id: string, roomName: string, now: number) {
    this.mutate(id, { roomName, lastActiveAt: now });
  }

  async appendTurn(id: string, turn: Turn) {
    this.turns.set(id, [...(this.turns.get(id) ?? []), turn]);
    this.mutate(id, { lastActiveAt: turn.ts });
  }

  async listTurns(id: string, limit?: number) {
    const all = this.turns.get(id) ?? [];
    return limit === undefined ? [...all] : all.slice(-limit);
  }

  async countTurns(id: string) {
    return (this.turns.get(id) ?? []).length;
  }

  async addCorrection(id: string, correction: Correction) {
    this.corrections.set(id, [...(this.corrections.get(id) ?? []), correction]);
    this.mutate(id, { lastActiveAt: correction.ts });
  }

  async listCorrections(id: string) {
    return [...(this.corrections.get(id) ?? [])];
  }

  async completeGoal(id: string, goalId: string) {
    const set = this.goals.get(id) ?? new Set<string>();
    set.add(goalId);
    this.goals.set(id, set);
    this.dirty.add(id);
    return this.listGoals(id);
  }

  async listGoals(id: string) {
    return [...(this.goals.get(id) ?? [])].sort();
  }

  async addVoiceMs(id: string, ms: number, now: number) {
    const session = this.sessions.get(id);
    if (session && ms > 0)
      this.mutate(id, { voiceMs: session.voiceMs + Math.round(ms), lastActiveAt: now });
  }

  async recordTextActivity(id: string, now: number) {
    const session = this.sessions.get(id);
    if (!session) return;
    const increment = textActivityIncrementMs(session.lastTextAt, now);
    this.mutate(id, { textMs: session.textMs + increment, lastTextAt: now, lastActiveAt: now });
  }

  async recordLatency(id: string, ms: number) {
    const session = this.sessions.get(id);
    if (!session || !(ms > 0)) return;
    this.mutate(id, {
      latencySumMs: session.latencySumMs + Math.round(ms),
      latencyCount: session.latencyCount + 1,
    });
  }

  async end(id: string, now: number) {
    const session = this.sessions.get(id);
    if (!session) return null;
    if (session.status === 'ended') return session;
    this.mutate(id, { status: 'ended', endedAt: now, lastActiveAt: now });
    await this.clearActiveSession(session.learnerId, id);
    return this.sessions.get(id) ?? null;
  }

  async setActiveSession(learnerId: string, sessionId: string) {
    this.active.set(learnerId, sessionId);
  }

  async getActiveSession(learnerId: string) {
    return this.active.get(learnerId) ?? null;
  }

  async clearActiveSession(learnerId: string, sessionId: string) {
    if (this.active.get(learnerId) === sessionId) this.active.delete(learnerId);
  }

  async listActiveSessionIds() {
    return [...this.sessions.values()].filter((s) => s.status === 'active').map((s) => s.id);
  }

  async markDirty(id: string) {
    this.dirty.add(id);
  }

  async takeDirty(max: number) {
    const ids = [...this.dirty].slice(0, max);
    for (const id of ids) this.dirty.delete(id);
    return ids;
  }
}
