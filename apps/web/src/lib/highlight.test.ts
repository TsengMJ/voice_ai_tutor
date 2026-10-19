import { describe, expect, it } from 'vitest';
import { highlightSegments } from './highlight';

describe('highlightSegments', () => {
  it('returns the whole text unmarked when there is nothing to highlight', () => {
    expect(highlightSegments('I want coffee', [])).toEqual([
      { text: 'I want coffee', marked: false },
    ]);
  });

  it('marks a phrase case-insensitively while keeping the original casing', () => {
    expect(highlightSegments('Yesterday I go there', ['i GO'])).toEqual([
      { text: 'Yesterday ', marked: false },
      { text: 'I go', marked: true },
      { text: ' there', marked: false },
    ]);
  });

  it('merges overlapping matches into one marked segment', () => {
    expect(highlightSegments('a big big cat', ['big big', 'big cat'])).toEqual([
      { text: 'a ', marked: false },
      { text: 'big big cat', marked: true },
    ]);
  });

  it('marks every occurrence', () => {
    const marked = highlightSegments('more better and more better', ['more better']).filter(
      (s) => s.marked,
    );
    expect(marked).toHaveLength(2);
  });

  it('returns no segments for empty text', () => {
    expect(highlightSegments('', ['x'])).toEqual([]);
  });
});
