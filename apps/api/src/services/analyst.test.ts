import { ApiError, ThinkingLevel } from '@google/genai';
import type { Correction } from '@tutor/core';
import { describe, expect, it } from 'vitest';
import {
  HINT_MAX_OUTPUT_TOKENS,
  HINT_POLICY,
  SUMMARY_POLICY,
  fallbackSummary,
  hintGenerationConfig,
  isTransientModelError,
} from './analyst.js';

describe('isTransientModelError', () => {
  it('retries rate limits and server errors', () => {
    expect(isTransientModelError(new ApiError({ message: 'slow down', status: 429 }))).toBe(true);
    expect(isTransientModelError(new ApiError({ message: 'oops', status: 503 }))).toBe(true);
  });

  it('does not retry a rejected request', () => {
    expect(isTransientModelError(new ApiError({ message: 'bad key', status: 403 }))).toBe(false);
  });

  it('retries network failures and malformed JSON', () => {
    expect(isTransientModelError(new TypeError('fetch failed'))).toBe(true);
    expect(isTransientModelError(new SyntaxError('Unexpected token'))).toBe(true);
  });
});

const correction = (category: Correction['category'], id: string): Correction => ({
  id,
  category,
  original: 'a',
  corrected: 'b',
  explanation: 'c',
  ts: 0,
});

describe('model call policies', () => {
  it('retries a hint once inside the browser request budget', () => {
    expect(HINT_POLICY).toEqual({ timeoutMs: 8_000, retries: 1, retryDelayMs: 500 });
    expect(
      HINT_POLICY.timeoutMs * (HINT_POLICY.retries + 1) + HINT_POLICY.retryDelayMs,
    ).toBeLessThan(20_000);
  });

  it('tries a summary once, because a failure already has a fallback', () => {
    expect(SUMMARY_POLICY).toEqual({ timeoutMs: 12_000, retries: 0, retryDelayMs: 0 });
  });
});

describe('hintGenerationConfig', () => {
  it('caps the reply and skips a long thinking pass', () => {
    const config = hintGenerationConfig();
    expect(config.maxOutputTokens).toBe(HINT_MAX_OUTPUT_TOKENS);
    expect(config.thinkingConfig?.thinkingLevel).toBe(ThinkingLevel.MINIMAL);
    expect(config.responseMimeType).toBe('application/json');
  });
});

describe('fallbackSummary', () => {
  it('praises a session with no corrections', () => {
    expect(fallbackSummary([]).headline).toMatch(/no corrections/);
  });

  it('prioritizes the most frequent mistake categories', () => {
    const summary = fallbackSummary([
      correction('tense', '1'),
      correction('grammar', '2'),
      correction('tense', '3'),
    ]);
    expect(summary.focus[0]?.title).toBe('Tense (2)');
  });

  it('labels categories in sentence case', () => {
    expect(fallbackSummary([correction('word_order', '1')]).focus[0]?.title).toBe('Word order (1)');
  });

  it('caps focus items at three', () => {
    const categories = ['tense', 'grammar', 'vocabulary', 'register'] as const;
    const summary = fallbackSummary(categories.map((c, i) => correction(c, String(i))));
    expect(summary.focus).toHaveLength(3);
  });
});
