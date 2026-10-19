import type { Turn } from '@tutor/core/browser';

export interface LiveStream {
  identity: string;
  text: string;
  streamId: string;
  segmentId?: string;
}

export interface LiveDraft {
  role: Turn['role'];
  text: string;
}

/** LiveKit replaces the stream id when a segment is finalized; the segment id stays. */
export function segmentKey(stream: Pick<LiveStream, 'streamId' | 'segmentId'>): string {
  return stream.segmentId ?? stream.streamId;
}

export function roleOf(identity: string, agentIdentity: string | undefined): Turn['role'] {
  return agentIdentity && identity === agentIdentity ? 'tutor' : 'learner';
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * The saved turn and the lingering transcription are the same utterance.
 * Short drafts stay visible so a new "yes" is not swallowed by an earlier sentence.
 */
function sameUtterance(draft: string, committed: string): boolean {
  if (draft === committed) return true;
  const [shorter, longer] =
    draft.length < committed.length ? [draft, committed] : [committed, draft];
  if (shorter.length < 12) return false;
  return longer.includes(shorter) && shorter.length / longer.length >= 0.8;
}

export function selectLiveDrafts(
  streams: LiveStream[],
  turns: Pick<Turn, 'role' | 'text'>[],
  agentIdentity: string | undefined,
  retired: ReadonlySet<string>,
): LiveDraft[] {
  const drafts = new Map<Turn['role'], LiveDraft>();
  for (const stream of streams) {
    const text = stream.text.trim();
    if (!text || retired.has(segmentKey(stream))) continue;
    const role = roleOf(stream.identity, agentIdentity);
    const norm = normalize(text);
    const echoed = turns.some(
      (turn) => turn.role === role && sameUtterance(norm, normalize(turn.text)),
    );
    if (echoed) continue;
    drafts.set(role, { role, text });
  }
  return [...drafts.values()];
}

/** Hide every in-progress segment for speakers who just got a finished turn. */
export function retireSegments(
  streams: LiveStream[],
  roles: ReadonlySet<Turn['role']>,
  agentIdentity: string | undefined,
  retired: Set<string>,
): void {
  for (const stream of streams) {
    if (roles.has(roleOf(stream.identity, agentIdentity))) retired.add(segmentKey(stream));
  }
}
