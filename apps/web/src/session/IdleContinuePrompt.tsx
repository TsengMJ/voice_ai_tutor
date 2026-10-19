import { useIsSpeaking, useLocalParticipant, useVoiceAssistant } from '@livekit/components-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui';
import { HEARING_HOLD_MS, learnerIsAudible } from './speechPhase';
import { idlePromptIdle, stepIdlePrompt, type IdlePromptState } from './idlePrompt';

/** Ignores a short noise blip, and the tutor's voice coming back through the speakers. */
function useLearnerAudible(tutorBusy: boolean): boolean {
  const { localParticipant } = useLocalParticipant();
  const micActive = useIsSpeaking(localParticipant);
  const [since, setSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!micActive || tutorBusy) {
      setSince(null);
      return;
    }
    const started = Date.now();
    setSince(started);
    setNow(started);
    const timer = setTimeout(() => setNow(Date.now()), HEARING_HOLD_MS);
    return () => clearTimeout(timer);
  }, [micActive, tutorBusy]);

  return learnerIsAudible({
    micActive: since !== null,
    micActiveForMs: since === null ? 0 : now - since,
    tutorSpeaking: tutorBusy,
  });
}

/**
 * After a quiet stretch in voice mode, asks whether to keep the session.
 * Speaking, typing, or the tutor taking a turn dismisses it.
 */
export function IdleContinuePrompt({
  enabled,
  pending,
  onExpire,
}: {
  enabled: boolean;
  pending: boolean;
  onExpire: () => void;
}) {
  const { state } = useVoiceAssistant();
  const tutorBusy = state === 'thinking' || state === 'speaking';
  const learnerSpeaking = useLearnerAudible(tutorBusy);
  const quiet = enabled && !pending && !tutorBusy && !learnerSpeaking;
  const prompt = useRef<IdlePromptState>(idlePromptIdle);
  const expired = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const [confirmSeconds, setConfirmSeconds] = useState<number | null>(null);

  const acknowledge = () => {
    const step = stepIdlePrompt(prompt.current, {
      now: Date.now(),
      quiet: true,
      acknowledged: true,
    });
    prompt.current = step.state;
    setConfirmSeconds(null);
  };

  useEffect(() => {
    const tick = () => {
      const step = stepIdlePrompt(prompt.current, {
        now: Date.now(),
        quiet,
        acknowledged: false,
      });
      prompt.current = step.state;
      if (step.kind === 'close') {
        setConfirmSeconds(null);
        if (!expired.current) {
          expired.current = true;
          onExpireRef.current();
        }
        return;
      }
      setConfirmSeconds(step.kind === 'confirm' ? Math.ceil(step.remainingMs / 1000) : null);
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [quiet]);

  if (confirmSeconds === null) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="idle-continue-title"
        className="w-full max-w-sm animate-pop rounded-3xl border border-line bg-card p-6 shadow-lift"
      >
        <h2 id="idle-continue-title" className="font-display text-2xl">
          Still there?
        </h2>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-ink-soft">
          You haven't said anything for a bit. Keep going, or this session will wrap up.
        </p>
        <p className="mt-4 font-display text-4xl tabular-nums" aria-live="polite">
          {confirmSeconds}
        </p>
        <Button className="mt-5 w-full" onClick={acknowledge}>
          Keep going
        </Button>
      </div>
    </div>
  );
}
