import type { Correction } from '@tutor/core';
import { describe, expect, it } from 'vitest';
import { fallbackSummary } from './analyst.js';

const correction = (category: Correction['category'], id: string): Correction => ({
  id,
  category,
  original: 'a',
  corrected: 'b',
  explanation: 'c',
  ts: 0,
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
