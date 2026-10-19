import { describe, expect, it } from 'vitest';
import { retireSegments, segmentKey, selectLiveDrafts, type LiveStream } from './liveDrafts';

const SAID = "I don't know why your response time is so delay is so long.";

const learner = (text: string, streamId = 'stream-a', segmentId = 'seg-1'): LiveStream => ({
  identity: 'learner',
  text,
  streamId,
  segmentId,
});

describe('selectLiveDrafts', () => {
  it('shows speech that has not been saved as a turn yet', () => {
    expect(selectLiveDrafts([learner('Hello there')], [], 'agent', new Set())).toEqual([
      { role: 'learner', text: 'Hello there' },
    ]);
  });

  it('hides a transcription once the same utterance is a finished turn', () => {
    const streams = [learner(SAID, 'stream-final', 'seg-9')];
    const turns = [{ role: 'learner' as const, text: SAID }];
    expect(selectLiveDrafts(streams, turns, 'agent', new Set())).toEqual([]);
  });

  it('hides a segment retired when the turn arrived, even after its stream id changes', () => {
    const interim = learner("I don't know why", 'stream-a', 'seg-1');
    const retired = new Set<string>();
    retireSegments([interim], new Set(['learner']), 'agent', retired);
    const finalized = learner(SAID, 'stream-b', 'seg-1');
    expect(segmentKey(finalized)).toBe('seg-1');
    expect(selectLiveDrafts([finalized], [], 'agent', retired)).toEqual([]);
  });

  it('still shows a genuinely new utterance', () => {
    const turns = [{ role: 'learner' as const, text: SAID }];
    expect(
      selectLiveDrafts(
        [learner('Could I get a latte?', 'stream-c', 'seg-2')],
        turns,
        'agent',
        new Set(),
      ),
    ).toEqual([{ role: 'learner', text: 'Could I get a latte?' }]);
  });

  it('does not treat a short new word as a repeat of an earlier sentence', () => {
    const turns = [{ role: 'learner' as const, text: 'Yes, a medium latte please.' }];
    expect(
      selectLiveDrafts([learner('Yes', 'stream-d', 'seg-3')], turns, 'agent', new Set()),
    ).toEqual([{ role: 'learner', text: 'Yes' }]);
  });
});
