import { InMemorySessionStore, type Hint, type Scenario, type SessionSummary } from '@tutor/core';
import { pino } from 'pino';
import type {
  DashboardStats,
  SessionSnapshot,
  StatsRepository,
  StoredReview,
} from '../db/repository.js';
import type { TutorAnalyst } from '../services/analyst.js';
import type { LiveKitGateway } from '../services/livekit.js';
import { InMemoryLocks } from '../services/locks.js';
import { SessionService } from '../services/sessionService.js';

export class FakeRepository implements StatsRepository {
  readonly snapshots = new Map<string, SessionSnapshot>();
  readonly saved: SessionSnapshot[] = [];
  readonly learners = new Map<string, boolean>();

  async ping() {}
  async ensureLearner(id: string, isDemo: boolean) {
    if (!this.learners.has(id)) this.learners.set(id, isDemo);
  }
  async isDemoLearner(id: string) {
    return this.learners.get(id) ?? false;
  }
  async upsertScenarios(_scenarios: readonly Scenario[]) {}

  async saveSnapshot(snapshot: SessionSnapshot) {
    this.saved.push(snapshot);
    const previous = this.snapshots.get(snapshot.session.id);
    const stored = previous?.turns ?? [];
    const skip = Math.max(0, stored.length - (snapshot.firstSeq ?? 0));
    this.snapshots.set(snapshot.session.id, {
      ...snapshot,
      firstSeq: 0,
      turns: [...stored, ...snapshot.turns.slice(skip)],
      summary: snapshot.summary ?? previous?.summary ?? null,
    });
  }

  async nextTurnSeq(sessionId: string) {
    return this.snapshots.get(sessionId)?.turns.length ?? 0;
  }

  async getReview(sessionId: string): Promise<StoredReview | null> {
    const snap = this.snapshots.get(sessionId);
    if (!snap) return null;
    const s = snap.session;
    return {
      learnerId: s.learnerId,
      session: {
        id: s.id,
        scenarioId: s.scenarioId,
        language: s.language,
        mode: s.mode,
        status: s.status,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        voiceMs: s.voiceMs,
        textMs: s.textMs,
        turnCount: snap.turns.length,
        completedGoals: snap.goals,
        avgLatencyMs: null,
        remainingMs: 0,
      },
      turns: snap.turns,
      corrections: snap.corrections,
      summary: snap.summary,
    };
  }

  async countSessions(learnerId: string) {
    return [...this.snapshots.values()].filter((s) => s.session.learnerId === learnerId).length;
  }

  async getDashboard(): Promise<DashboardStats> {
    return {
      totals: {
        sessions: 0,
        practiceMs: 0,
        voiceMs: 0,
        textMs: 0,
        turns: 0,
        goals: 0,
        corrections: 0,
      },
      todayMs: 0,
      weekMs: 0,
      streakDays: 0,
      avgLatencyMs: null,
      last7Days: [],
      topMistakes: [],
      recent: [],
    };
  }
}

export class FakeLiveKit implements LiveKitGateway {
  readonly serverUrl = 'wss://example.livekit.cloud';
  readonly issued: { identity: string; roomName: string; sessionId: string }[] = [];
  readonly deleted: string[] = [];

  async issueToken(input: Parameters<LiveKitGateway['issueToken']>[0]) {
    this.issued.push({
      identity: input.identity,
      roomName: input.roomName,
      sessionId: input.metadata.sessionId,
    });
    return `token-for-${input.roomName}`;
  }

  async deleteRoom(roomName: string) {
    this.deleted.push(roomName);
  }
}

export class FakeAnalyst implements TutorAnalyst {
  failNext = false;
  summarizeCalls = 0;

  async hint(): Promise<Hint> {
    if (this.failNext) throw new Error('model down');
    return { suggestion: 'Could I get a latte?', translation: 'Could I get a latte?' };
  }

  async summarize(): Promise<SessionSummary> {
    this.summarizeCalls += 1;
    if (this.failNext) throw new Error('model down');
    return { headline: 'Great job', strengths: ['Clear greeting'], focus: [], source: 'model' };
  }
}

export function buildTestService(overrides: { now?: () => number } = {}) {
  const store = new InMemorySessionStore();
  const repo = new FakeRepository();
  const livekit = new FakeLiveKit();
  const analyst = new FakeAnalyst();
  const locks = new InMemoryLocks();
  let counter = 0;
  const service = new SessionService({
    store,
    repo,
    livekit,
    analyst,
    locks,
    logger: pino({ level: 'silent' }),
    now: overrides.now ?? (() => 1_000_000),
    newId: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
  });
  return { service, store, repo, livekit, analyst, locks };
}
