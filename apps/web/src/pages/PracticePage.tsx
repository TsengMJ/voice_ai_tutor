import type { Catalog, Mode, Scenario } from '@tutor/core/browser';
import { ArrowRight, Keyboard, MapPin, Mic, PlayCircle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoalList } from '../components/GoalList';
import { Button, ErrorPanel, Eyebrow, Pill, Segmented, Spinner, cx } from '../components/ui';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';

const LEVEL_TONE = { Beginner: 'sage', Intermediate: 'butter', Advanced: 'coral' } as const;

export function PracticePage() {
  const catalog = useAsync(api.catalog, []);
  const me = useAsync(api.me, []);

  if (catalog.loading && !catalog.data) return <Spinner label="Loading scenarios" />;
  if (catalog.error || !catalog.data) {
    return (
      <ErrorPanel
        title="Couldn't load scenarios"
        message={catalog.error?.message ?? 'Unknown error'}
        action={<Button onClick={catalog.reload}>Try again</Button>}
      />
    );
  }
  return <Picker catalog={catalog.data} activeSessionId={me.data?.activeSessionId ?? null} />;
}

function Picker({
  catalog,
  activeSessionId,
}: {
  catalog: Catalog;
  activeSessionId: string | null;
}) {
  const navigate = useNavigate();
  const [language, setLanguage] = useState(catalog.languages[0]?.code ?? 'en');
  const [mode, setMode] = useState<Mode>('voice');
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async (scenario: Scenario) => {
    setStarting(scenario.id);
    setError(null);
    try {
      const session = await api.createSession({ scenarioId: scenario.id, language, mode });
      navigate(`/practice/${session.id}`, { state: { mode } });
    } catch (err) {
      setError((err as Error).message);
      setStarting(null);
    }
  };

  return (
    <div className="space-y-10 animate-rise">
      <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-xl">
          <Eyebrow>Practice</Eyebrow>
          <h1 className="mt-2 font-display text-4xl md:text-5xl">Choose a scene to step into.</h1>
          <p className="mt-3 text-muted">
            Each role-play has three small goals. Speak naturally; you can interrupt the tutor,
            switch to typing at any time, and get feedback at the end.
          </p>
        </div>
        <div className="flex flex-col gap-3 md:items-end">
          <Segmented
            label="Language to practice"
            value={language}
            onChange={setLanguage}
            options={catalog.languages.map((l) => ({ value: l.code, label: l.nativeLabel }))}
          />
          <Segmented
            label="Start in"
            value={mode}
            onChange={setMode}
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
        </div>
      </header>

      {activeSessionId && (
        <div className="flex flex-col items-start gap-3 rounded-3xl border border-coral/30 bg-coral-soft/60 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-coral-deep">
            You have a session in progress. Starting a new one will wrap it up.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/practice/${activeSessionId}`)}
          >
            <PlayCircle className="size-4" /> Continue it
          </Button>
        </div>
      )}

      {error && (
        <p className="rounded-2xl bg-coral-soft p-4 text-sm font-semibold text-coral-deep">
          {error}
        </p>
      )}

      <section className="grid gap-5 md:grid-cols-3">
        {catalog.scenarios.map((scenario, i) => (
          <article
            key={scenario.id}
            style={{ animationDelay: `${i * 70}ms` }}
            className="group flex animate-rise flex-col rounded-[1.75rem] border border-line bg-card p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
          >
            <div className="flex items-center justify-between">
              <Pill tone={LEVEL_TONE[scenario.level]}>{scenario.level}</Pill>
              <span className="font-display text-sm italic text-muted">
                as {scenario.learnerRole}
              </span>
            </div>
            <h2 className="mt-5 font-display text-2xl leading-tight">{scenario.title}</h2>
            <p className="mt-1.5 text-sm text-ink-soft">{scenario.tagline}</p>
            <p className="mt-4 flex items-start gap-1.5 text-xs text-muted">
              <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {scenario.setting} You'll talk with {scenario.tutorRole}.
            </p>
            <div className="mt-5 rounded-2xl bg-paper p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-muted">Goals</p>
              <GoalList goals={scenario.goals} completed={[]} />
            </div>
            <Button
              className={cx('mt-6 w-full', starting && starting !== scenario.id && 'opacity-50')}
              loading={starting === scenario.id}
              disabled={starting !== null}
              onClick={() => start(scenario)}
            >
              Start conversation <ArrowRight className="size-4" />
            </Button>
          </article>
        ))}
      </section>
    </div>
  );
}
