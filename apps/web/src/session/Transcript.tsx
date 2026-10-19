import type { Turn } from '@tutor/core/browser';
import { useTranscriptions, useVoiceAssistant } from '@livekit/components-react';
import { Keyboard, Mic } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cx } from '../components/ui';
import type { PendingMessage } from './useTutorSession';

interface Draft {
  role: Turn['role'];
  text: string;
}

/**
 * Streaming transcription for the turn in progress. A stream is retired once the
 * agent confirms a finished turn for the same speaker, so text never shows twice.
 */
function useLiveDrafts(turns: Turn[]): Draft[] {
  const transcriptions = useTranscriptions();
  const { agent } = useVoiceAssistant();
  const [retired, setRetired] = useState<Set<string>>(() => new Set());
  const [seenTurns, setSeenTurns] = useState(turns.length);

  const roleOf = (identity: string): Turn['role'] =>
    agent && identity === agent.identity ? 'tutor' : 'learner';

  if (turns.length !== seenTurns) {
    const roles = new Set(turns.slice(seenTurns).map((t) => t.role));
    const next = new Set(retired);
    for (const t of transcriptions) {
      if (roles.has(roleOf(t.participantInfo.identity))) next.add(t.streamInfo.id);
    }
    setSeenTurns(turns.length);
    setRetired(next);
  }

  const drafts = new Map<Turn['role'], Draft>();
  for (const t of transcriptions) {
    if (retired.has(t.streamInfo.id) || !t.text.trim()) continue;
    const role = roleOf(t.participantInfo.identity);
    drafts.set(role, { role, text: t.text });
  }
  return [...drafts.values()];
}

function Bubble({
  role,
  children,
  meta,
  muted,
}: {
  role: Turn['role'];
  children: React.ReactNode;
  meta?: React.ReactNode;
  muted?: boolean;
}) {
  const tutor = role === 'tutor';
  return (
    <div className={cx('flex animate-rise', tutor ? 'justify-start' : 'justify-end')}>
      <div
        className={cx('max-w-[85%]', tutor ? 'items-start' : 'items-end', 'flex flex-col gap-1')}
      >
        <div
          className={cx(
            'rounded-3xl px-4 py-3 text-[15px] leading-relaxed',
            tutor ? 'rounded-bl-lg border border-line bg-card' : 'rounded-br-lg bg-ink text-paper',
            muted && 'opacity-60',
          )}
        >
          {children}
        </div>
        {meta && (
          <div className="flex items-center gap-1.5 px-2 text-[11px] font-semibold text-muted">
            {meta}
          </div>
        )}
      </div>
    </div>
  );
}

export function Transcript({ turns, pending }: { turns: Turn[]; pending: PendingMessage[] }) {
  const drafts = useLiveDrafts(turns);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, pending.length, drafts]);

  if (turns.length === 0 && pending.length === 0 && drafts.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted">
        Your conversation will appear here. Say hello when you're ready.
      </p>
    );
  }

  return (
    <div className="space-y-4" aria-live="polite">
      {turns.map((turn) => (
        <Bubble
          key={turn.id}
          role={turn.role}
          meta={
            <>
              {turn.modality === 'voice' ? (
                <Mic className="size-3" />
              ) : (
                <Keyboard className="size-3" />
              )}
              {turn.role === 'tutor' ? 'Tutor' : 'You'}
              {turn.interrupted && <span className="italic text-coral-deep">· cut off</span>}
            </>
          }
        >
          {turn.text}
        </Bubble>
      ))}
      {pending.map((p) => (
        <Bubble key={p.key} role="learner" muted meta="Sending…">
          {p.text}
        </Bubble>
      ))}
      {drafts.map((d) => (
        <Bubble key={`draft-${d.role}`} role={d.role} muted>
          {d.text}
          <span className="ml-1 inline-block animate-pulse">▍</span>
        </Bubble>
      ))}
      <div ref={end} />
    </div>
  );
}
