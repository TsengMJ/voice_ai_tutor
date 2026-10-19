import { GoogleGenAI } from '@google/genai';
import {
  buildHintPrompt,
  buildSummaryPrompt,
  type Correction,
  type CorrectionCategory,
  type Hint,
  type Scenario,
  type SessionSummary,
  type Turn,
} from '@tutor/core';
import { z } from 'zod';

export interface AnalysisInput {
  scenario: Scenario;
  languageCode: string;
  turns: readonly Turn[];
}

/** Non-realtime language analysis: hints and end-of-session feedback. */
export interface TutorAnalyst {
  hint(input: AnalysisInput): Promise<Hint>;
  summarize(input: AnalysisInput & { corrections: readonly Correction[] }): Promise<SessionSummary>;
}

const HintSchema = z.object({ suggestion: z.string().min(1), translation: z.string() });
const SummarySchema = z.object({
  headline: z.string().min(1),
  strengths: z.array(z.string()).max(4).default([]),
  focus: z
    .array(z.object({ title: z.string(), tip: z.string() }))
    .max(5)
    .default([]),
});

export class GeminiAnalyst implements TutorAnalyst {
  private readonly ai: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async hint(input: AnalysisInput): Promise<Hint> {
    return HintSchema.parse(await this.generateJson(buildHintPrompt(input)));
  }

  async summarize(input: AnalysisInput & { corrections: readonly Correction[] }) {
    if (input.turns.length === 0) return fallbackSummary(input.corrections);
    const parsed = SummarySchema.parse(await this.generateJson(buildSummaryPrompt(input)));
    return {
      headline: parsed.headline,
      strengths: parsed.strengths.slice(0, 2),
      focus: parsed.focus.slice(0, 3),
      source: 'model' as const,
    };
  }

  private async generateJson(prompt: string): Promise<unknown> {
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.4 },
    });
    const text = response.text;
    if (!text) throw new Error('Gemini returned an empty response');
    return JSON.parse(text);
  }
}

const CATEGORY_TIPS: Record<CorrectionCategory, string> = {
  grammar: 'Slow down on sentence structure; say the corrected sentences out loud twice.',
  vocabulary: 'Review the corrected words and use each one in a sentence of your own.',
  tense: 'Before answering, decide whether you are talking about past, present, or future.',
  word_order: 'Practice the corrected sentences until the word order feels natural.',
  register: 'Notice who you are talking to and match their level of formality.',
  pronunciation: 'Repeat the tricky words slowly, then at normal speed.',
  other: 'Revisit the corrections from this session before your next practice.',
};

/** Deterministic feedback used when the model is unavailable, so a session always gets a review. */
export function fallbackSummary(corrections: readonly Correction[]): SessionSummary {
  const counts = new Map<CorrectionCategory, number>();
  for (const c of corrections) counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return {
    headline:
      corrections.length === 0
        ? 'Nice work, no corrections were needed this time.'
        : `You worked through ${corrections.length} correction${corrections.length === 1 ? '' : 's'} this session.`,
    strengths: corrections.length === 0 ? ['You kept the conversation going smoothly.'] : [],
    focus: top.map(([category, count]) => ({
      title: `${category.replace('_', ' ')} (${count})`,
      tip: CATEGORY_TIPS[category],
    })),
    source: 'fallback',
  };
}
