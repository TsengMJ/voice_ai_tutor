import {
  getScenario,
  type Correction,
  type Mode,
  type Scenario,
  type SessionReview,
} from '@tutor/core/browser';
import { RoomAudioRenderer, RoomContext, StartAudio } from '@livekit/components-react';
import {
  ArrowLeft,
  Clock,
  Flag,
  Keyboard,
  Lightbulb,
  ListChecks,
  Loader2,
  Mic,
  SpellCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CorrectionCard } from '../components/CorrectionCard';
import { GoalList } from '../components/GoalList';
import { Button, ErrorPanel, Eyebrow, Pill, Segmented, Spinner, cx } from '../components/ui';
import { api, isNotFound } from '../lib/api';
import { formatClock, languageLabel } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Composer } from '../session/Composer';
import { HintCard, useHint } from '../session/HintCard';
import { Transcript } from '../session/Transcript';
import { TutorOrb } from '../session/TutorOrb';
import { useTutorSession } from '../session/useTutorSession';

export function SessionPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const review = useAsync(() => api.session(id), [id]);

  if (review.loading && !review.data) return <Spinner label="Opening your session" />;
  if (review.error && !isNotFound(review.error)) {
    return (
      <ErrorPanel
        title="Couldn't open your session"
        message={review.error.message}
        action={<Button onClick={review.reload}>Try again</Button>}
      />
    );
  }
  if (!review.data) {
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

type Panel = 'brief' | 'hint' | 'corrections';

const PANEL_TITLE: Record<Panel, string> = {
  brief: 'Your role & goals',
  hint: 'Get a hint',
  corrections: 'Corrections',
};

function LiveSession({ review, initialMode }: { review: SessionReview; initialMode: Mode }) {
  const navigate = useNavigate();
  const sessionId = review.session.id;
  const scenario = getScenario(review.session.scenarioId);
  const tutor = useTutorSession(sessionId, review, initialMode);
  const remaining = useCountdown(tutor.deadline);
  const hint = useHint(sessionId);
  const [draft, setDraft] = useState('');
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [seenCorrections, setSeenCorrections] = useState(tutor.corrections.length);

  useEffect(() => {
    if (!panel) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel]);

  const finish = async () => {
    setEnding(true);
    setEndError(null);
    await tutor.disconnect();
    try {
      await api.end(sessionId);
      navigate(`/sessions/${sessionId}`);
    } catch (err) {
      setEnding(false);
      setEndError((err as Error).message);
    }
  };

  const keepPracticing = () => {
    setEndError(null);
    tutor.retry();
  };

  const togglePanel = (next: Panel) => {
    if (panel === 'corrections' || next === 'corrections') {
      setSeenCorrections(tutor.corrections.length);
    }
    setPanel(panel === next ? null : next);
  };

  const applyHint = (text: string) => {
    setDraft(text);
    setPanel(null);
  };

  if (endError) {
    return (
      <ErrorPanel
        title="Couldn't save your session"
        message={endError}
        action={
          <div className="flex gap-3">
            <Button variant="secondary" onClick={keepPracticing}>
              Keep practicing
            </Button>
            <Button loading={ending} onClick={finish}>
              Try again
            </Button>
          </div>
        }
      />
    );
  }

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
  const controlsDisabled = !connected || tutor.timeUp;
  const unseenCorrections =
    panel === 'corrections' ? 0 : tutor.corrections.length - seenCorrections;
  const goalProgress = `${tutor.completedGoals.length}/${scenario.goals.length}`;

  const countdown = <Countdown remaining={remaining} />;
  const modeSwitch = (
    <ModeSwitch
      mode={tutor.mode}
      disabled={controlsDisabled}
      onChange={(m) => void tutor.switchMode(m)}
    />
  );
  const endButton = (compact: boolean) => (
    <Button
      variant="danger"
      size="sm"
      loading={ending}
      onClick={finish}
      aria-label={compact ? 'End and review' : undefined}
      className={compact ? 'max-sm:w-9 max-sm:px-0' : undefined}
    >
      {!ending && <Flag className="size-4" />}
      <span className={compact ? 'max-sm:sr-only' : undefined}>End &amp; review</span>
    </Button>
  );

  return (
    <RoomContext.Provider value={tutor.room}>
      <RoomAudioRenderer />
      <div className="grid h-full min-h-0 animate-rise grid-rows-[minmax(0,1fr)] gap-5 xl:grid-cols-[17rem_minmax(0,1fr)_17rem] 2xl:grid-cols-[19rem_minmax(0,1fr)_19rem]">
        <aside className="hidden min-h-0 flex-col gap-5 overflow-y-auto pb-2 xl:flex">
          <SessionTitle language={review.session.language} title={scenario.title} />
          <div className="rounded-3xl border border-line bg-card p-5 shadow-soft">
            <ScenarioBrief scenario={scenario} completed={tutor.completedGoals} />
          </div>
        </aside>

        <section
          data-chat-mode={tutor.mode}
          className="flex min-h-0 flex-col overflow-hidden rounded-[1.75rem] border border-line bg-card shadow-soft"
        >
          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5 xl:hidden">
            <div className="min-w-0 flex-1">
              <SessionTitle compact language={review.session.language} title={scenario.title} />
            </div>
            {countdown}
            {modeSwitch}
            {endButton(true)}
          </div>

          <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 md:px-5">
            <TutorOrb mode={tutor.mode} status={tutor.status} name={scenario.tutorRole} />
            <div className="flex shrink-0 items-center gap-1.5 xl:hidden">
              <PanelButton
                icon={ListChecks}
                label="Goals"
                badge={goalProgress}
                active={panel === 'brief'}
                onClick={() => togglePanel('brief')}
              />
              <PanelButton
                icon={Lightbulb}
                label="Hint"
                active={panel === 'hint'}
                onClick={() => togglePanel('hint')}
              />
              <PanelButton
                icon={SpellCheck}
                label="Corrections"
                badge={tutor.corrections.length > 0 ? String(tutor.corrections.length) : undefined}
                highlight={unseenCorrections > 0}
                active={panel === 'corrections'}
                onClick={() => togglePanel('corrections')}
              />
            </div>
          </header>

          <StartAudio
            label="Tap to enable audio"
            className="mx-auto mt-3 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white"
          />

          {tutor.status === 'reconnecting' && (
            <div
              role="status"
              className="mx-3 mt-3 flex items-center gap-2 rounded-2xl bg-butter-soft px-4 py-2.5 text-sm font-semibold text-[#8a6416]"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden /> Connection dropped.
              Reconnecting to your tutor…
            </div>
          )}

          {tutor.notice && (
            <div className="mx-3 mt-3 flex items-center justify-between gap-3 rounded-2xl bg-butter-soft px-4 py-2.5 text-sm font-semibold text-[#8a6416]">
              {tutor.notice}
              <button onClick={tutor.dismissNotice} aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </div>
          )}

          {tutor.timeUp && (
            <div className="mx-3 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-paper">
              <p className="font-display text-lg">Time's up — nice work today.</p>
              <Button variant="secondary" size="sm" loading={ending} onClick={finish}>
                See your feedback
              </Button>
            </div>
          )}

          <div className="relative min-h-0 flex-1 bg-paper/60">
            <div className="h-full overflow-y-auto px-3 py-5 md:px-6">
              <Transcript turns={tutor.turns} pending={tutor.pending} mode={tutor.mode} />
            </div>

            {panel && (
              <div
                id="session-panel"
                role="dialog"
                aria-label={PANEL_TITLE[panel]}
                className="absolute inset-0 z-10 flex flex-col bg-paper/80 p-3 backdrop-blur-sm xl:hidden"
                onClick={(event) => event.target === event.currentTarget && setPanel(null)}
              >
                <div className="flex max-h-full animate-pop flex-col overflow-hidden rounded-3xl border border-line bg-card shadow-lift">
                  <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
                    <p className="text-sm font-bold">{PANEL_TITLE[panel]}</p>
                    <button
                      onClick={() => setPanel(null)}
                      aria-label="Close"
                      className="flex size-8 items-center justify-center rounded-full hover:bg-paper-deep"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="overflow-y-auto p-4">
                    {panel === 'brief' && (
                      <ScenarioBrief scenario={scenario} completed={tutor.completedGoals} />
                    )}
                    {panel === 'hint' && (
                      <HintCard state={hint} disabled={tutor.timeUp} onUse={applyHint} />
                    )}
                    {panel === 'corrections' && (
                      <CorrectionList
                        corrections={tutor.corrections}
                        language={review.session.language}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-line bg-card p-3">
            <Composer
              mode={tutor.mode}
              disabled={controlsDisabled}
              draft={draft}
              onDraftChange={setDraft}
              onSend={(text) => void tutor.sendText(text)}
            />
          </div>
        </section>

        <aside className="hidden min-h-0 flex-col gap-5 overflow-y-auto pb-2 xl:flex">
          <div className="space-y-3 rounded-3xl border border-line bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between gap-2">
              {countdown}
              {endButton(false)}
            </div>
            {modeSwitch}
          </div>
          <HintCard state={hint} disabled={tutor.timeUp} onUse={applyHint} />
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-muted">
              Corrections · {tutor.corrections.length}
            </p>
            <CorrectionList corrections={tutor.corrections} language={review.session.language} />
          </div>
        </aside>
      </div>
    </RoomContext.Provider>
  );
}

function SessionTitle({
  language,
  title,
  compact = false,
}: {
  language: string;
  title: string;
  compact?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Link
        to="/practice"
        aria-label="Back to scenarios"
        className={cx(
          'flex shrink-0 items-center justify-center rounded-full border border-line bg-card hover:border-ink/30',
          compact ? 'size-9' : 'size-10',
        )}
      >
        <ArrowLeft className="size-4" />
      </Link>
      <div className="min-w-0">
        <div className={compact ? 'max-sm:hidden' : undefined}>
          <Eyebrow>{languageLabel(language)}</Eyebrow>
        </div>
        <h1
          className={cx(
            'font-display leading-tight',
            compact ? 'truncate text-lg md:text-xl' : 'text-2xl',
          )}
        >
          {title}
        </h1>
      </div>
    </div>
  );
}

function Countdown({ remaining }: { remaining: number }) {
  const lowTime = remaining < 60_000;
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold tabular-nums',
        lowTime ? 'bg-coral-soft text-coral-deep' : 'bg-paper-deep text-ink-soft',
      )}
      aria-label={`${formatClock(remaining)} remaining`}
    >
      <Clock className="size-4 max-sm:hidden" /> {formatClock(remaining)}
    </span>
  );
}

function ModeSwitch({
  mode,
  disabled,
  onChange,
}: {
  mode: Mode;
  disabled: boolean;
  onChange: (mode: Mode) => void;
}) {
  return (
    <Segmented
      label="Conversation mode"
      value={mode}
      onChange={onChange}
      disabled={disabled}
      options={[
        {
          value: 'voice',
          label: (
            <>
              <Mic className="size-4" /> <span className="max-sm:sr-only">Voice</span>
            </>
          ),
        },
        {
          value: 'text',
          label: (
            <>
              <Keyboard className="size-4" /> <span className="max-sm:sr-only">Text</span>
            </>
          ),
        },
      ]}
    />
  );
}

function PanelButton({
  icon: Icon,
  label,
  badge,
  highlight = false,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  badge?: string;
  highlight?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-expanded={active}
      aria-controls={active ? 'session-panel' : undefined}
      className={cx(
        'relative inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors',
        active
          ? 'border-ink bg-ink text-paper'
          : 'border-line bg-card text-ink-soft hover:border-ink/30',
      )}
    >
      <Icon className="size-4" aria-hidden />
      <span className="max-md:sr-only">{label}</span>
      {badge && (
        <span
          className={cx(
            'rounded-full px-1.5 text-[11px] font-bold tabular-nums',
            highlight
              ? 'bg-coral text-white'
              : active
                ? 'bg-paper/20 text-paper'
                : 'bg-paper-deep text-ink-soft',
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function ScenarioBrief({ scenario, completed }: { scenario: Scenario; completed: string[] }) {
  return (
    <>
      <Pill tone="neutral">You are {scenario.learnerRole}</Pill>
      <p className="mt-3 text-sm text-ink-soft">{scenario.setting}</p>
      <p className="mb-3 mt-5 text-xs font-bold uppercase tracking-[0.14em] text-muted">
        Goals · {completed.length}/{scenario.goals.length}
      </p>
      <GoalList goals={scenario.goals} completed={completed} />
    </>
  );
}

function CorrectionList({
  corrections,
  language,
}: {
  corrections: Correction[];
  language: string;
}) {
  if (corrections.length === 0) {
    return (
      <p className="rounded-3xl border border-dashed border-line p-5 text-sm text-muted">
        Gentle corrections will appear here while you talk — the tutor won't interrupt the flow.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {[...corrections].reverse().map((c) => (
        <CorrectionCard key={c.id} correction={c} language={language} />
      ))}
    </div>
  );
}
