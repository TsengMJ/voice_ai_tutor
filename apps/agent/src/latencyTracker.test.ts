import { describe, expect, it } from 'vitest';
import { LatencyTracker, type LatencySample } from './latencyTracker.js';

function tracker(voice = true) {
  const recorded: number[] = [];
  const t = new LatencyTracker({ expectsAudio: () => voice, onLatency: (ms) => recorded.push(ms) });
  return { t, recorded };
}

const eou = (speechId: string, ms: number): LatencySample => ({ kind: 'eou', speechId, ms });
const llm = (speechId: string, ms: number): LatencySample => ({ kind: 'llm', speechId, ms });
const tts = (speechId: string, ms: number): LatencySample => ({ kind: 'tts', speechId, ms });

describe('LatencyTracker', () => {
  it('sums end of turn, first token and first audio for a voice reply', () => {
    const { t, recorded } = tracker();
    [eou('s1', 300), llm('s1', 400), tts('s1', 150)].forEach((s) => t.add(s));
    expect(recorded).toEqual([850]);
  });

  it('waits for first audio even when it arrives before the LLM finishes', () => {
    const { t, recorded } = tracker();
    [eou('s1', 300), tts('s1', 150), llm('s1', 400)].forEach((s) => t.add(s));
    expect(recorded).toEqual([850]);
  });

  it('records first token alone in text mode', () => {
    const { t, recorded } = tracker(false);
    t.add(llm('s1', 400));
    expect(recorded).toEqual([400]);
  });

  it('records a reply without a spoken turn, such as the greeting', () => {
    const { t, recorded } = tracker();
    [llm('s1', 400), tts('s1', 150)].forEach((s) => t.add(s));
    expect(recorded).toEqual([550]);
  });

  it('records each reply once even if a tool call adds another LLM round', () => {
    const { t, recorded } = tracker();
    [llm('s1', 400), tts('s1', 150), llm('s1', 300), tts('s1', 100)].forEach((s) => t.add(s));
    expect(recorded).toEqual([550]);
  });

  it('ignores samples without a speech id', () => {
    const { t, recorded } = tracker(false);
    t.add({ kind: 'llm', speechId: undefined, ms: 400 });
    expect(recorded).toEqual([]);
  });
});
