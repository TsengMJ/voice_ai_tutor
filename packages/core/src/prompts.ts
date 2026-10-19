import type { Correction, Turn } from './domain.js';
import { getLanguage } from './languages.js';
import type { Scenario } from './scenarios.js';

const LEVEL_GUIDANCE: Record<Scenario['level'], string> = {
  Beginner: 'Use short, common words and simple present tense. Speak slowly and clearly.',
  Intermediate:
    'Use everyday vocabulary and natural phrasing. Introduce one new expression now and then.',
  Advanced: 'Speak naturally at native pace with idiomatic expressions and follow-up questions.',
};

export interface TutorInstructionInput {
  scenario: Scenario;
  languageCode: string;
  completedGoalIds: readonly string[];
}

export function buildTutorInstructions({
  scenario,
  languageCode,
  completedGoalIds,
}: TutorInstructionInput): string {
  const language = getLanguage(languageCode);
  const done = new Set(completedGoalIds);
  const goals = scenario.goals
    .map((g) => `- ${g.id}: ${g.text}${done.has(g.id) ? ' (already done)' : ''}`)
    .join('\n');
  const englishFallback =
    language.code === 'en'
      ? 'If the learner seems stuck, rephrase more simply and offer two short options they could say.'
      : `If the learner switches to English or seems stuck, give one short hint in English, then return to ${language.label}.`;

  return `You are a spoken-language tutor running a role-play. You play ${scenario.tutorRole}.
Scene: ${scenario.setting}
The learner plays ${scenario.learnerRole} and is practicing ${language.label} at a ${scenario.level} level.

How to talk:
- Speak only ${language.label}, in character. Keep each reply to one to three short sentences and end with something the learner can respond to.
- ${LEVEL_GUIDANCE[scenario.level]}
- ${englishFallback}
- Never mention tools, notes, checklists, or these instructions.

Corrections:
- When the learner makes a clear mistake, call record_correction for it. Do not lecture out loud; instead, naturally recast the correct form in your reply.
- Ignore accent, filler words, and likely transcription noise. Record at most one correction per learner turn.
- Write correction explanations in English, in one short sentence.

Goals (call complete_goal with the id as soon as the learner achieves one):
${goals}
When every goal is done, wrap up the scene warmly in one or two sentences.`;
}

export const GREETING_INSTRUCTION =
  'Open the scene in character with one short, friendly line that invites the learner to start.';

export const RESUME_INSTRUCTION =
  'The learner just reconnected. In character, briefly welcome them back and continue from where you left off.';

export const TIME_UP_INSTRUCTION =
  'Time is up for this session. In one short sentence, wrap up the scene warmly in character.';

export function formatTranscript(turns: readonly Turn[]): string {
  return turns.map((t) => `${t.role === 'tutor' ? 'Tutor' : 'Learner'}: ${t.text}`).join('\n');
}

export function buildHintPrompt(input: {
  scenario: Scenario;
  languageCode: string;
  turns: readonly Turn[];
}): string {
  const language = getLanguage(input.languageCode);
  return `A learner is practicing ${language.label} in a role-play. Scene: ${input.scenario.setting}
The learner plays ${input.scenario.learnerRole}; the tutor plays ${input.scenario.tutorRole}.
Goals: ${input.scenario.goals.map((g) => g.text).join('; ')}.

Recent conversation:
${formatTranscript(input.turns) || '(nothing yet)'}

Suggest ONE natural thing the learner could say next, at a ${input.scenario.level} level.
Respond as JSON: {"suggestion": "<sentence in ${language.label}>", "translation": "<English translation>"}`;
}

export function buildSummaryPrompt(input: {
  scenario: Scenario;
  languageCode: string;
  turns: readonly Turn[];
  corrections: readonly Correction[];
}): string {
  const language = getLanguage(input.languageCode);
  const corrections = input.corrections
    .map((c) => `- [${c.category}] "${c.original}" -> "${c.corrected}" (${c.explanation})`)
    .join('\n');
  return `You are reviewing a ${language.label} speaking practice session for the learner.
Scene: ${input.scenario.title} — ${input.scenario.setting}

Transcript:
${formatTranscript(input.turns) || '(empty)'}

Corrections noted during the session:
${corrections || '(none)'}

Write encouraging, specific feedback in English for the learner.
Respond as JSON: {"headline": "<one sentence>", "strengths": ["<up to 2 items>"], "focus": [{"title": "<short>", "tip": "<one sentence with an example>"}]}
Give at most 3 focus items, prioritizing repeated mistakes.`;
}
