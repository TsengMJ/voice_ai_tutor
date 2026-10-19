import { getScenario, type SessionReview } from '@tutor/core/browser';
import { ArrowRight, Keyboard, Mic, RotateCcw, Sparkles, Target, Timer, Zap } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { CorrectionCard } from '../components/CorrectionCard';
import { GoalList } from '../components/GoalList';
import { Button, Card, ErrorPanel, Eyebrow, Pill, Spinner, cx } from '../components/ui';
import { api, isNotFound } from '../lib/api';
import { formatDay, formatMinutes, languageLabel } from '../lib/format';
import { highlightSegments } from '../lib/highlight';
import { useAsync } from '../lib/useAsync';

export function ReviewPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const review = useAsync(() => api.session(id), [id]);

  if (review.loading && !review.data) return <Spinner label="Preparing your feedback" />;
  if (review.error && !isNotFound(review.error)) {
    return (
      <ErrorPanel
        title="Couldn't load your feedback"
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
        action={<Button onClick={() => navigate('/')}>Go to dashboard</Button>}
      />
    );
  }
  if (review.data.session.status === 'active') return <Navigate to={`/practice/${id}`} replace />;
  return <Review data={review.data} />;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-paper p-4">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted">
        {icon} {label}
      </p>
      <p className="mt-1.5 font-display text-2xl">{value}</p>
    </div>
  );
}

function Review({ data }: { data: SessionReview }) {
  const navigate = useNavigate();
  const { session, turns, corrections, summary } = data;
  const scenario = getScenario(session.scenarioId);
  const [again, setAgain] = useState(false);
  const mistakes = corrections.map((c) => c.original);
  const practiced = session.voiceMs + session.textMs;

  const practiceAgain = async () => {
    setAgain(true);
    try {
      const next = await api.createSession({
        scenarioId: session.scenarioId,
        language: session.language,
        mode: session.mode,
      });
      navigate(`/practice/${next.id}`, { state: { mode: session.mode } });
    } catch {
      setAgain(false);
      navigate('/practice');
    }
  };

  return (
    <div className="animate-rise space-y-8">
      <section className="relative overflow-hidden rounded-[2rem] bg-ink p-8 text-paper md:p-10">
        <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-coral/30 blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="coral">{languageLabel(session.language)}</Pill>
            <Pill className="bg-white/10 text-paper">{scenario.title}</Pill>
            <span className="text-sm text-paper/60">{formatDay(session.startedAt)}</span>
          </div>
          <h1 className="mt-5 max-w-2xl font-display text-3xl leading-tight md:text-5xl">
            {summary?.headline ?? 'Session complete.'}
          </h1>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button variant="secondary" loading={again} onClick={practiceAgain}>
              <RotateCcw className="size-4" /> Practice this again
            </Button>
            <Button
              variant="ghost"
              className="text-paper hover:bg-white/10"
              onClick={() => navigate('/')}
            >
              Dashboard <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<Timer className="size-3.5" />}
          label="Practice"
          value={formatMinutes(practiced)}
        />
        <Stat
          icon={<Target className="size-3.5" />}
          label="Goals"
          value={`${session.completedGoals.length}/${scenario.goals.length}`}
        />
        <Stat
          icon={<Sparkles className="size-3.5" />}
          label="Corrections"
          value={String(corrections.length)}
        />
        <Stat
          icon={<Zap className="size-3.5" />}
          label="Avg response"
          value={session.avgLatencyMs ? `${(session.avgLatencyMs / 1000).toFixed(1)}s` : '—'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {summary && (summary.strengths.length > 0 || summary.focus.length > 0) && (
            <Card>
              <Eyebrow>Coach's notes</Eyebrow>
              {summary.strengths.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {summary.strengths.map((s) => (
                    <li key={s} className="flex gap-2 text-sm text-ink-soft">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sage" /> {s}
                    </li>
                  ))}
                </ul>
              )}
              {summary.focus.length > 0 && (
                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  {summary.focus.map((f) => (
                    <div key={f.title} className="rounded-2xl bg-coral-soft/60 p-4">
                      <p className="text-sm font-bold text-coral-deep">{f.title}</p>
                      <p className="mt-1 text-sm text-ink-soft">{f.tip}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          <Card>
            <div className="flex items-center justify-between">
              <Eyebrow>Transcript</Eyebrow>
              {mistakes.length > 0 && (
                <span className="text-xs text-muted">
                  <mark className="rounded bg-coral-soft px-1 text-coral-deep">Highlighted</mark> =
                  corrected
                </span>
              )}
            </div>
            {turns.length === 0 ? (
              <p className="mt-4 text-sm text-muted">No conversation was recorded.</p>
            ) : (
              <ol className="mt-5 space-y-4">
                {turns.map((turn) => (
                  <li key={turn.id} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3">
                    <span
                      className={cx(
                        'flex items-center gap-1 pt-0.5 text-xs font-bold',
                        turn.role === 'tutor' ? 'text-muted' : 'text-ink',
                      )}
                    >
                      {turn.modality === 'voice' ? (
                        <Mic className="size-3" />
                      ) : (
                        <Keyboard className="size-3" />
                      )}
                      {turn.role === 'tutor' ? 'Tutor' : 'You'}
                    </span>
                    <p
                      className={cx(
                        'text-[15px] leading-relaxed',
                        turn.role === 'tutor' && 'text-ink-soft',
                      )}
                    >
                      {turn.role === 'learner'
                        ? highlightSegments(turn.text, mistakes).map((seg, i) =>
                            seg.marked ? (
                              <mark
                                key={i}
                                className="rounded bg-coral-soft px-0.5 text-coral-deep"
                              >
                                {seg.text}
                              </mark>
                            ) : (
                              <span key={i}>{seg.text}</span>
                            ),
                          )
                        : turn.text}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <Eyebrow>Goals</Eyebrow>
            <div className="mt-4">
              <GoalList goals={scenario.goals} completed={session.completedGoals} />
            </div>
          </Card>
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-muted">
              Corrections · {corrections.length}
            </p>
            {corrections.length === 0 ? (
              <p className="rounded-3xl border border-dashed border-line p-5 text-sm text-muted">
                No corrections this time — clean work.
              </p>
            ) : (
              <div className="space-y-3">
                {corrections.map((c) => (
                  <CorrectionCard key={c.id} correction={c} language={session.language} />
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
