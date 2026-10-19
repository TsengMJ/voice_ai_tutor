export interface LatencySample {
  kind: 'eou' | 'llm' | 'tts';
  speechId: string | undefined;
  ms: number;
}

interface Pending {
  eou?: number;
  llm?: number;
  tts?: number;
  done: boolean;
}

export interface LatencyTrackerDeps {
  expectsAudio: () => boolean;
  onLatency: (ms: number) => void;
}

const MAX_TRACKED_REPLIES = 32;

/**
 * Turns per-stage pipeline metrics into one learner-perceived number per reply:
 * end-of-turn delay + LLM first token + TTS first audio (TTS is skipped in text mode).
 */
export class LatencyTracker {
  private readonly replies = new Map<string, Pending>();

  constructor(private readonly deps: LatencyTrackerDeps) {}

  add(sample: LatencySample) {
    if (!sample.speechId) return;
    const reply = this.reply(sample.speechId);
    if (reply.done || reply[sample.kind] !== undefined) return;
    reply[sample.kind] = sample.ms;

    if (reply.llm === undefined) return;
    if (this.deps.expectsAudio() && reply.tts === undefined) return;
    reply.done = true;
    this.deps.onLatency((reply.eou ?? 0) + reply.llm + (reply.tts ?? 0));
  }

  private reply(speechId: string): Pending {
    let reply = this.replies.get(speechId);
    if (!reply) {
      reply = { done: false };
      this.replies.set(speechId, reply);
      if (this.replies.size > MAX_TRACKED_REPLIES) {
        this.replies.delete(this.replies.keys().next().value!);
      }
    }
    return reply;
  }
}
