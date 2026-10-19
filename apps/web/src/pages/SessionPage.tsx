import { getScenario, type Mode, type SessionReview } from '@tutor/core/browser';
import { RoomAudioRenderer, RoomContext, StartAudio } from '@livekit/components-react';
import { ArrowLeft, Clock, Flag, Keyboard, Mic, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CorrectionCard } from '../components/CorrectionCard';
import { GoalList } from '../components/GoalList';
import { Button, ErrorPanel, Eyebrow, Pill, Segmented, Spinner, cx } from '../components/ui';
import { api } from '../lib/api';
import { formatClock, languageLabel } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Composer } from '../session/Composer';
import { HintCard } from '../session/HintCard';
import { Transcript } from '../session/Transcript';
import { TutorOrb } from '../session/TutorOrb';
import { useTutorSession } from '../session/useTutorSession';

export function SessionPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const review = useAsync(() => api.session(id), [id]);

  if (review.loading && !review.data) return <Spinner label="Opening your session" />;
  if (review.error || !review.data) {
    return (
      <ErrorPanel
        title="Session not found"
        message="It may have expired or belong to someone else."
        action={<Button onClick={() => navigate('/practice')}>Start a new one</Button>}
      />
    );
  }
  if (review.data.session.status !== 'active') return <Navigate to={`/sessions/${id}`} replace />;

  const requested = (location.state as { mode?: Mode } | null)?.mode;
  return (
    <LiveSession
      key={id}
      review={review.data}
      initialMode={requested ?? review.data.session.mode}
    />
  );
}

function useCountdown(deadline: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, deadline - now);
}

function LiveSession({ review, initialMode }: { review: SessionReview; initialMode: Mode }) {
  const navigate = useNavigate();
  const sessionId = review.session.id;
  const scenario = getScenario(review.session.scenarioId);
  const tutor = useTutorSession(sessionId, review, initialMode);
  const remaining = useCountdown(tutor.deadline);
  const [draft, setDraft] = useState('');
  const [ending, setEnding] = useState(false);

  const finish = async () => {
    setEnding(true);
    await tutor.disconnect();
    try {
      await api.end(sessionId);
    } finally {
      navigate(`/sessions/${sessionId}`);
    }
  };

  if (tutor.status === 'failed') {
    return (
      <ErrorPanel
        title="Couldn't connect to your tutor"
        message={tutor.error ?? 'Check your connection and try again.'}
        action={
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => navigate('/practice')}>
              Back
            </Button>
            <Button onClick={tutor.retry}>Try again</Button>
          </div>
        }
      />
    );
  }

  const connected = tutor.status === 'connected';
  const lowTime = remaining < 60_000;

  return (
    <RoomContext.Provider value={tutor.room}>
      <RoomAudioRenderer />
      <div className="animate-rise space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              to="/practice"
              aria-label="Back to scenarios"
              className="flex size-10 items-center justify-center rounded-full border border-line bg-card hover:border-ink/30"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div>
              <Eyebrow>{languageLabel(review.session.language)}</Eyebrow>
              <h1 className="font-display text-2xl leading-tight md:text-3xl">{scenario.title}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={cx(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold tabular-nums',
                lowTime ? 'bg-coral-soft text-coral-deep' : 'bg-paper-deep text-ink-soft',
              )}
              aria-label={`${formatClock(remaining)} remaining`}
            >
              <Clock className="size-4" /> {formatClock(remaining)}
            </span>
            <Segmented
              label="Conversation mode"
              value={tutor.mode}
              onChange={(m) => void tutor.switchMode(m)}
              disabled={!connected || tutor.timeUp}
              options={[
                {
                  value: 'voice',
                  label: (
                    <>
                      <Mic className="size-4" /> Voice
                    </>
                  ),
                },
                {
                  value: 'text',
                  label: (
                    <>
                      <Keyboard className="size-4" /> Text
                    </>
                  ),
                },
              ]}
            />
            <Button variant="danger" size="sm" loading={ending} onClick={finish}>
              <Flag className="size-4" /> End &amp; review
            </Button>
          </div>
        </header>

        {tutor.notice && (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-butter-soft px-4 py-3 text-sm font-semibold text-[#8a6416]">
            {tutor.notice}
            <button onClick={tutor.dismissNotice} aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </div>
        )}

        {tutor.timeUp && (
          <div className="flex flex-col items-start gap-3 rounded-3xl bg-ink p-5 text-paper sm:flex-row sm:items-center sm:justify-between">
            <p className="font-display text-xl">Time's up — nice work today.</p>
            <Button variant="secondary" loading={ending} onClick={finish}>
              See your feedback
            </Button>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
          <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-3xl border border-line bg-card p-5 shadow-soft">
              <Pill tone="neutral">You are {scenario.learnerRole}</Pill>
              <p className="mt-3 text-sm text-ink-soft">{scenario.setting}</p>
              <p className="mb-3 mt-5 text-xs font-bold uppercase tracking-[0.14em] text-muted">
                Goals · {tutor.completedGoals.length}/{scenario.goals.length}
              </p>
              <GoalList goals={scenario.goals} completed={tutor.completedGoals} />
            </div>
          </aside>

          <section className="flex min-h-[560px] flex-col rounded-[2rem] border border-line bg-card/70 shadow-soft">
            <TutorOrb mode={tutor.mode} status={tutor.status} />
            <StartAudio
              label="Tap to enable audio"
              className="mx-auto mb-2 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white"
            />
            <div className="max-h-[52vh] flex-1 overflow-y-auto border-t border-line px-4 py-5 md:px-6">
              <Transcript turns={tutor.turns} pending={tutor.pending} />
            </div>
            <div className="border-t border-line p-3 md:p-4">
              <Composer
                mode={tutor.mode}
                disabled={!connected || tutor.timeUp}
                draft={draft}
                onDraftChange={setDraft}
                onSend={(text) => void tutor.sendText(text)}
              />
            </div>
          </section>

          <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
            <HintCard sessionId={sessionId} disabled={tutor.timeUp} onUse={setDraft} />
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-muted">
                Corrections · {tutor.corrections.length}
              </p>
              {tutor.corrections.length === 0 ? (
                <p className="rounded-3xl border border-dashed border-line p-5 text-sm text-muted">
                  Gentle corrections will appear here while you talk — the tutor won't interrupt the
                  flow.
                </p>
              ) : (
                <div className="space-y-3">
                  {[...tutor.corrections].reverse().map((c) => (
                    <CorrectionCard key={c.id} correction={c} />
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </RoomContext.Provider>
  );
}
