import type { Mode, Turn } from '@tutor/core/browser';
import {
  useIsSpeaking,
  useLocalParticipant,
  useTranscriptions,
  useVoiceAssistant,
} from '@livekit/components-react';
import { Keyboard, Mic } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cx } from '../components/ui';
import { retireSegments, selectLiveDrafts, type LiveDraft, type LiveStream } from './liveDrafts';
import {
  HEARING_HOLD_MS,
  learnerIsAudible,
  nextSpeechPhase,
  type SpeechPhase,
} from './speechPhase';
import type { PendingMessage } from './useTutorSession';

/**
 * Streaming transcription for the turn in progress. A segment is retired when the
 * agent saves that speaker's turn. Finalized segments also stay hidden when their
 * text matches a saved turn: LiveKit issues them a new stream id, which used to
 * bring the same sentence back as a gray draft.
 */
function useLiveDrafts(turns: Turn[]): LiveDraft[] {
  const transcriptions = useTranscriptions();
  const { agent } = useVoiceAssistant();
  const [retired, setRetired] = useState<Set<string>>(() => new Set());
  const [seenTurns, setSeenTurns] = useState(turns.length);

  const streams: LiveStream[] = transcriptions.map((stream) => ({
    identity: stream.participantInfo.identity,
    text: stream.text,
    streamId: stream.streamInfo.id,
    segmentId: stream.streamInfo.attributes?.['lk.segment_id'],
  }));

  let hidden = retired;
  if (turns.length !== seenTurns) {
    const roles = new Set(turns.slice(seenTurns).map((turn) => turn.role));
    hidden = new Set(retired);
    retireSegments(streams, roles, agent?.identity, hidden);
    setSeenTurns(turns.length);
    setRetired(hidden);
  }

  return selectLiveDrafts(streams, turns, agent?.identity, hidden);
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
    <div
      className={cx('flex animate-rise items-end gap-2', tutor ? 'justify-start' : 'justify-end')}
    >
      {tutor && (
        <span
          className={cx('orb orb-avatar size-7 shrink-0', meta !== undefined && 'mb-5')}
          aria-hidden
        />
      )}
      <div
        className={cx(
          'flex max-w-[80%] flex-col gap-1 md:max-w-[70%]',
          tutor ? 'items-start' : 'items-end',
        )}
      >
        <div
          className={cx(
            'rounded-[1.4rem] px-4 py-2.5 text-[15px] leading-relaxed shadow-soft',
            tutor ? 'rounded-bl-md bg-card text-ink' : 'rounded-br-md bg-ink text-paper',
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

const CUE_LABEL: Record<Exclude<SpeechPhase, 'idle'>, string> = {
  hearing: 'Listening',
  holding: 'Got it',
};

/** Learner-side cue covering the gap before the transcript arrives. */
function useAudibleMic(micActive: boolean, tutorSpeaking: boolean): boolean {
  const [since, setSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!micActive || tutorSpeaking) {
      setSince(null);
      return;
    }
    const started = Date.now();
    setSince(started);
    setNow(started);
    const timer = setTimeout(() => setNow(Date.now()), HEARING_HOLD_MS);
    return () => clearTimeout(timer);
  }, [micActive, tutorSpeaking]);

  return learnerIsAudible({
    micActive: since !== null,
    micActiveForMs: since === null ? 0 : now - since,
    tutorSpeaking,
  });
}

function useLearnerCue(mode: Mode, turns: Turn[], hasDraft: boolean): SpeechPhase {
  const { localParticipant } = useLocalParticipant();
  const { state } = useVoiceAssistant();
  const speaking = useAudibleMic(useIsSpeaking(localParticipant), state === 'speaking');
  const learnerTurns = turns.reduce((count, turn) => count + (turn.role === 'learner' ? 1 : 0), 0);
  const [phase, setPhase] = useState<SpeechPhase>('idle');
  const [baseline, setBaseline] = useState(learnerTurns);

  const next = nextSpeechPhase(phase, {
    voice: mode === 'voice',
    speaking,
    learnerTextReady: hasDraft || learnerTurns > baseline,
  });
  if (next !== phase) {
    if (next === 'holding') setBaseline(learnerTurns);
    setPhase(next);
  }
  return next;
}

function Pulse() {
  return (
    <span className="inline-flex h-4 items-center gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-bounce rounded-full bg-current"
          style={{ animationDelay: `${i * 140}ms` }}
        />
      ))}
    </span>
  );
}

export function Transcript({
  turns,
  pending,
  mode,
}: {
  turns: Turn[];
  pending: PendingMessage[];
  mode: Mode;
}) {
  const drafts = useLiveDrafts(turns);
  const learnerDraft = drafts.some((draft) => draft.role === 'learner');
  const tutorDraft = drafts.some((draft) => draft.role === 'tutor');
  const phase = useLearnerCue(mode, turns, learnerDraft);
  const { state } = useVoiceAssistant();
  const tutorCue = !tutorDraft && (state === 'thinking' || state === 'speaking');
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, pending.length, drafts, phase, tutorCue]);

  if (
    turns.length === 0 &&
    pending.length === 0 &&
    drafts.length === 0 &&
    phase === 'idle' &&
    !tutorCue
  ) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="font-display text-xl">Say hello to start.</p>
        <p className="max-w-xs text-sm text-muted">
          Type in the message box below, or just speak when Voice is on.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" aria-live="polite">
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
      {phase !== 'idle' && !learnerDraft && (
        <Bubble role="learner" meta={CUE_LABEL[phase]}>
          <Pulse />
          <span className="sr-only">{CUE_LABEL[phase]}</span>
        </Bubble>
      )}
      {tutorCue && (
        <Bubble role="tutor" meta="Thinking">
          <Pulse />
          <span className="sr-only">Thinking</span>
        </Bubble>
      )}
      <div ref={end} />
    </div>
  );
}
