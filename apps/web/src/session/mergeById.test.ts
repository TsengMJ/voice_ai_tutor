import { describe, expect, it } from 'vitest';
import { mergeById } from './mergeById';

const item = (id: string, ts: number) => ({ id, ts });

describe('mergeById', () => {
  it('inserts missed items in timestamp order', () => {
    const merged = mergeById([item('a', 1), item('c', 3)], [item('a', 1), item('b', 2)]);
    expect(merged.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns the same array when nothing is missing', () => {
    const current = [item('a', 1)];
    expect(mergeById(current, [item('a', 1)])).toBe(current);
  });
});
