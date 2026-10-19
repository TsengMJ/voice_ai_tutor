import {
  averageLatencyMs,
  dayInTimeZone,
  shiftDay,
  computeStreak,
  type Correction,
  type CorrectionCategory,
  type DashboardData,
  type Scenario,
  type SessionState,
  type SessionSummary,
  type SessionView,
  type Turn,
} from '@tutor/core';
import type { Pool, PoolClient } from 'pg';

export interface SessionSnapshot {
  session: SessionState;
  turns: Turn[];
  corrections: Correction[];
  goals: string[];
  /** null keeps any summary that was stored earlier. */
  summary: SessionSummary | null;
}

export interface StoredReview {
  learnerId: string;
  session: SessionView;
  turns: Turn[];
  corrections: Correction[];
  summary: SessionSummary | null;
}

export type DashboardStats = Omit<DashboardData, 'isDemo' | 'activeSessionId'>;

export interface StatsRepository {
  ping(): Promise<void>;
  ensureLearner(id: string, isDemo: boolean): Promise<void>;
  isDemoLearner(id: string): Promise<boolean>;
  upsertScenarios(scenarios: readonly Scenario[]): Promise<void>;
  saveSnapshot(snapshot: SessionSnapshot): Promise<void>;
  getReview(sessionId: string): Promise<StoredReview | null>;
  countSessions(learnerId: string): Promise<number>;
  getDashboard(learnerId: string, today: string): Promise<DashboardStats>;
}

interface SessionRow {
  id: string;
  learner_id: string;
  scenario_id: string;
  language: string;
  mode: 'voice' | 'text';
  status: 'active' | 'ended';
  started_at: Date;
  ended_at: Date | null;
  voice_ms: number;
  text_ms: number;
  turn_count: number;
  goals_completed: string[];
  avg_latency_ms: number | null;
  summary: SessionSummary | null;
}

const ms = (value: unknown) => Number(value ?? 0);

export class PgStatsRepository implements StatsRepository {
  constructor(private readonly pool: Pool) {}

  async ping() {
    await this.pool.query('select 1');
  }

  async ensureLearner(id: string, isDemo: boolean) {
    await this.pool.query(
      'insert into learners (id, is_demo) values ($1, $2) on conflict (id) do nothing',
      [id, isDemo],
    );
  }

  async isDemoLearner(id: string) {
    const { rows } = await this.pool.query<{ is_demo: boolean }>(
      'select is_demo from learners where id = $1',
      [id],
    );
    return rows[0]?.is_demo ?? false;
  }

  async upsertScenarios(scenarios: readonly Scenario[]) {
    for (const s of scenarios) {
      await this.pool.query(
        `insert into scenarios (id, title, level, goals) values ($1, $2, $3, $4)
         on conflict (id) do update set title = excluded.title, level = excluded.level,
           goals = excluded.goals, updated_at = now()`,
        [s.id, s.title, s.level, JSON.stringify(s.goals)],
      );
    }
  }

  async saveSnapshot({ session, turns, corrections, goals, summary }: SessionSnapshot) {
    const localDay = dayInTimeZone(session.startedAt, session.timezone);
    await this.inTransaction(async (db) => {
      await db.query('insert into learners (id) values ($1) on conflict (id) do nothing', [
        session.learnerId,
      ]);
      await db.query(
        `insert into sessions (id, learner_id, scenario_id, language, timezone, local_day, status, mode,
           started_at, ended_at, voice_ms, text_ms, turn_count, goals_completed, avg_latency_ms, summary)
         values ($1,$2,$3,$4,$5,$6,$7,$8,to_timestamp($9/1000.0),to_timestamp($10/1000.0),$11,$12,$13,$14,$15,$16)
         on conflict (id) do update set status = excluded.status, mode = excluded.mode,
           ended_at = excluded.ended_at, voice_ms = excluded.voice_ms, text_ms = excluded.text_ms,
           turn_count = excluded.turn_count, goals_completed = excluded.goals_completed,
           avg_latency_ms = excluded.avg_latency_ms,
           summary = coalesce(excluded.summary, sessions.summary), updated_at = now()`,
        [
          session.id,
          session.learnerId,
          session.scenarioId,
          session.language,
          session.timezone,
          localDay,
          session.status,
          session.mode,
          session.startedAt,
          session.endedAt,
          session.voiceMs,
          session.textMs,
          turns.length,
          goals,
          averageLatencyMs(session),
          summary ? JSON.stringify(summary) : null,
        ],
      );
      for (const [seq, t] of turns.entries()) {
        await db.query(
          `insert into turns (session_id, seq, id, role, modality, text, interrupted, created_at)
           values ($1,$2,$3,$4,$5,$6,$7,to_timestamp($8/1000.0)) on conflict do nothing`,
          [session.id, seq, t.id, t.role, t.modality, t.text, t.interrupted, t.ts],
        );
      }
      for (const c of corrections) {
        await db.query(
          `insert into corrections (id, session_id, learner_id, category, original, corrected, explanation, created_at)
           values ($1,$2,$3,$4,$5,$6,$7,to_timestamp($8/1000.0)) on conflict (id) do nothing`,
          [
            c.id,
            session.id,
            session.learnerId,
            c.category,
            c.original,
            c.corrected,
            c.explanation,
            c.ts,
          ],
        );
      }
      await this.refreshDailyStats(db, session.learnerId, localDay);
    });
  }

  /** Recomputes one learner-day from source rows, so repeated flushes stay idempotent. */
  private async refreshDailyStats(db: PoolClient, learnerId: string, day: string) {
    await db.query(
      `insert into daily_stats (learner_id, day, sessions, practice_ms, voice_ms, text_ms, turns, goals, corrections)
       select $1, $2::date, count(*), coalesce(sum(s.voice_ms + s.text_ms), 0),
         coalesce(sum(s.voice_ms), 0), coalesce(sum(s.text_ms), 0), coalesce(sum(s.turn_count), 0),
         coalesce(sum(cardinality(s.goals_completed)), 0),
         (select count(*) from corrections c join sessions s2 on s2.id = c.session_id
           where s2.learner_id = $1 and s2.local_day = $2::date)
       from sessions s where s.learner_id = $1 and s.local_day = $2::date
       on conflict (learner_id, day) do update set sessions = excluded.sessions,
         practice_ms = excluded.practice_ms, voice_ms = excluded.voice_ms, text_ms = excluded.text_ms,
         turns = excluded.turns, goals = excluded.goals, corrections = excluded.corrections`,
      [learnerId, day],
    );
  }

  async getReview(sessionId: string): Promise<StoredReview | null> {
    const { rows } = await this.pool.query<SessionRow>('select * from sessions where id = $1', [
      sessionId,
    ]);
    const row = rows[0];
    if (!row) return null;
    const [turns, corrections] = await Promise.all([
      this.pool.query(
        'select id, role, modality, text, interrupted, created_at from turns where session_id = $1 order by seq',
        [sessionId],
      ),
      this.pool.query(
        'select id, category, original, corrected, explanation, created_at from corrections where session_id = $1 order by created_at',
        [sessionId],
      ),
    ]);
    return {
      learnerId: row.learner_id,
      session: {
        id: row.id,
        scenarioId: row.scenario_id,
        language: row.language,
        mode: row.mode,
        status: row.status,
        startedAt: row.started_at.getTime(),
        endedAt: row.ended_at?.getTime() ?? null,
        voiceMs: row.voice_ms,
        textMs: row.text_ms,
        turnCount: row.turn_count,
        completedGoals: row.goals_completed,
        avgLatencyMs: row.avg_latency_ms,
        remainingMs: 0,
      },
      turns: turns.rows.map((t) => ({
        id: t.id,
        role: t.role,
        modality: t.modality,
        text: t.text,
        interrupted: t.interrupted,
        ts: (t.created_at as Date).getTime(),
      })),
      corrections: corrections.rows.map((c) => ({
        id: c.id,
        category: c.category,
        original: c.original,
        corrected: c.corrected,
        explanation: c.explanation,
        ts: (c.created_at as Date).getTime(),
      })),
      summary: row.summary,
    };
  }

  async countSessions(learnerId: string) {
    const { rows } = await this.pool.query('select count(*) from sessions where learner_id = $1', [
      learnerId,
    ]);
    return Number(rows[0]?.count ?? 0);
  }

  async getDashboard(learnerId: string, today: string): Promise<DashboardStats> {
    const weekStart = shiftDay(today, -6);
    const [totals, days, latency, mistakes, recent] = await Promise.all([
      this.pool.query(
        `select coalesce(sum(sessions),0) sessions, coalesce(sum(practice_ms),0) practice_ms,
           coalesce(sum(voice_ms),0) voice_ms, coalesce(sum(text_ms),0) text_ms,
           coalesce(sum(turns),0) turns, coalesce(sum(goals),0) goals, coalesce(sum(corrections),0) corrections
         from daily_stats where learner_id = $1`,
        [learnerId],
      ),
      this.pool.query<{ day: string; sessions: number; practice_ms: string }>(
        `select to_char(day, 'YYYY-MM-DD') as day, sessions, practice_ms from daily_stats
         where learner_id = $1 and sessions > 0 and day >= $2::date - 90 order by day`,
        [learnerId, today],
      ),
      this.pool.query(
        'select round(avg(avg_latency_ms)) avg from sessions where learner_id = $1 and avg_latency_ms is not null',
        [learnerId],
      ),
      this.pool.query<{ category: CorrectionCategory; count: string }>(
        `select category, count(*) from corrections where learner_id = $1
         group by category order by count(*) desc, category limit 5`,
        [learnerId],
      ),
      this.pool.query(
        `select id, scenario_id, language, status, started_at, voice_ms + text_ms practice_ms,
           turn_count, cardinality(goals_completed) goals from sessions
         where learner_id = $1 order by started_at desc limit 6`,
        [learnerId],
      ),
    ]);

    const byDay = new Map(days.rows.map((d) => [d.day, d]));
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const day = shiftDay(weekStart, i);
      const row = byDay.get(day);
      return { day, practiceMs: ms(row?.practice_ms), sessions: Number(row?.sessions ?? 0) };
    });
    const t = totals.rows[0] ?? {};
    const avg = latency.rows[0]?.avg;

    return {
      totals: {
        sessions: Number(t.sessions ?? 0),
        practiceMs: ms(t.practice_ms),
        voiceMs: ms(t.voice_ms),
        textMs: ms(t.text_ms),
        turns: Number(t.turns ?? 0),
        goals: Number(t.goals ?? 0),
        corrections: Number(t.corrections ?? 0),
      },
      todayMs: last7Days[6]?.practiceMs ?? 0,
      weekMs: last7Days.reduce((sum, d) => sum + d.practiceMs, 0),
      streakDays: computeStreak(byDay.keys(), today),
      avgLatencyMs: avg === null || avg === undefined ? null : Number(avg),
      last7Days,
      topMistakes: mistakes.rows.map((m) => ({ category: m.category, count: Number(m.count) })),
      recent: recent.rows.map((r) => ({
        id: r.id,
        scenarioId: r.scenario_id,
        language: r.language,
        status: r.status,
        startedAt: (r.started_at as Date).getTime(),
        practiceMs: ms(r.practice_ms),
        turnCount: r.turn_count,
        goalsCompleted: Number(r.goals),
      })),
    };
  }

  private async inTransaction(fn: (db: PoolClient) => Promise<void>) {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await fn(client);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }
}
