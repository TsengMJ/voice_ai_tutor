import { SCENARIOS, type Correction, type SessionState, type Turn } from '@tutor/core';
import type { StatsRepository } from '../db/repository.js';
import { fallbackSummary } from '../services/analyst.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const SAMPLE_CORRECTIONS: Omit<Correction, 'id' | 'ts'>[] = [
  {
    original: 'I want a coffee big',
    corrected: 'I would like a large coffee',
    explanation: 'Adjectives go before the noun, and "would like" sounds more polite.',
    category: 'word_order',
  },
  {
    original: 'Yesterday I go to the office',
    corrected: 'Yesterday I went to the office',
    explanation: 'Use the past tense for finished actions.',
    category: 'tense',
  },
  {
    original: 'He have two years experience',
    corrected: 'He has two years of experience',
    explanation: '"Has" agrees with "he", and "of" links the amount to the noun.',
    category: 'grammar',
  },
  {
    original: 'Can I borrow your pen for take notes?',
    corrected: 'Can I borrow your pen to take notes?',
    explanation: 'Use "to" + verb to express purpose.',
    category: 'grammar',
  },
  {
    original: "What's up, sir?",
    corrected: 'How are you today?',
    explanation: '"What\'s up" is too casual for an interview.',
    category: 'register',
  },
  {
    original: 'I am boring in meetings',
    corrected: 'I get bored in meetings',
    explanation: '"Boring" describes the thing; "bored" describes how you feel.',
    category: 'vocabulary',
  },
];

/** Practice days relative to today, chosen to show a live streak and a realistic gap. */
const DAYS_AGO = [13, 12, 10, 9, 7, 6, 4, 3, 2, 1];

/** A short exchange in which the learner actually says the corrected phrases. */
function sampleTurns(
  scenarioIndex: number,
  startedAt: number,
  corrections: readonly Correction[],
): Turn[] {
  const scenario = SCENARIOS[scenarioIndex % SCENARIOS.length]!;
  const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);
  const lines: [Turn['role'], string][] = [
    ['tutor', `Hi there! (${scenario.title}, sample session)`],
    ['learner', 'Hello! Nice to meet you.'],
    ['tutor', 'Nice to meet you too. What would you like to talk about?'],
    ['learner', sentence(corrections[0]?.original ?? 'I am ready')],
    [
      'tutor',
      `Good try! You could say: “${sentence(corrections[0]?.corrected ?? 'I am ready')}” Go on!`,
    ],
    ['learner', corrections[1] ? `Okay. ${sentence(corrections[1].original)}` : 'Okay, thank you!'],
  ];
  return lines.map(([role, text], i) => ({
    id: `demo-${startedAt}-${i}`,
    role,
    modality: i === 3 ? 'text' : 'voice',
    text,
    interrupted: false,
    ts: startedAt + i * 20_000,
  }));
}

/** Seeds a clearly labeled sample history for a learner who has none yet. */
export async function seedDemoHistory(
  repo: StatsRepository,
  now: number,
  learnerId: string,
  newId: () => string,
): Promise<boolean> {
  await repo.ensureLearner(learnerId, true);
  if ((await repo.countSessions(learnerId)) > 0) return false;

  for (const [i, daysAgo] of DAYS_AGO.entries()) {
    const sessionId = newId();
    const scenario = SCENARIOS[i % SCENARIOS.length]!;
    const startedAt = now - daysAgo * DAY_MS - 2 * 60 * 60 * 1000;
    const voiceMs = 150_000 + ((i * 37_000) % 240_000);
    const textMs = 30_000 + ((i * 11_000) % 90_000);
    const corrections: Correction[] = [0, 1]
      .slice(0, 1 + (i % 2))
      .map((k) => SAMPLE_CORRECTIONS[(i + k) % SAMPLE_CORRECTIONS.length]!)
      .map((c, k) => ({ ...c, id: `${sessionId}-${k}`, ts: startedAt + 60_000 }));
    const turns = sampleTurns(i, startedAt, corrections);
    const session: SessionState = {
      id: sessionId,
      learnerId,
      scenarioId: scenario.id,
      language: 'en',
      timezone: 'UTC',
      mode: 'voice',
      status: 'ended',
      roomName: '',
      startedAt,
      endedAt: startedAt + voiceMs + textMs,
      lastActiveAt: startedAt + voiceMs + textMs,
      lastTextAt: null,
      voiceMs,
      textMs,
      latencySumMs: 640 + ((i * 53) % 220),
      latencyCount: 1,
    };
    const goals = scenario.goals.slice(0, 1 + (i % scenario.goals.length)).map((g) => g.id);
    await repo.saveSnapshot({
      session,
      turns,
      corrections,
      goals,
      summary: fallbackSummary(corrections),
    });
  }
  return true;
}
