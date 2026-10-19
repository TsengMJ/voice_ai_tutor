import type { DashboardData } from '@tutor/core/browser';
import {
  ArrowRight,
  Flame,
  Gauge,
  Keyboard,
  MessageCircle,
  Mic,
  PlayCircle,
  Sparkles,
  Target,
  Timer,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { Button, Card, ErrorPanel, Eyebrow, Pill, Spinner, cx } from '../components/ui';
import { api } from '../lib/api';
import {
  categoryLabel,
  formatDay,
  formatMinutes,
  greeting,
  languageLabel,
  minutes,
  scenarioTitle,
  weekdayLabel,
} from '../lib/format';
import { useAsync } from '../lib/useAsync';

export function DashboardPage() {
  const { data, error, loading, reload } = useAsync(api.dashboard, []);

  if (loading && !data) return <Spinner label="Loading your progress" />;
  if (error || !data) {
    return (
      <ErrorPanel
        title="Couldn't load your dashboard"
        message={error?.message ?? 'Unknown error'}
        action={<Button onClick={reload}>Try again</Button>}
      />
    );
  }
  return <Dashboard data={data} />;
}

function Dashboard({ data }: { data: DashboardData }) {
  const isEmpty = data.totals.sessions === 0;
  return (
    <div className="space-y-8 animate-rise">
      <Hero data={data} />
      {isEmpty ? (
        <EmptyState />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat icon={<Timer />} label="Today" value={minutes(data.todayMs)} unit="min" />
            <Stat icon={<Sparkles />} label="This week" value={minutes(data.weekMs)} unit="min" />
            <Stat
              icon={<Flame />}
              label="Streak"
              value={data.streakDays}
              unit={data.streakDays === 1 ? 'day' : 'days'}
              highlight={data.streakDays > 0}
            />
            <Stat
              icon={<Gauge />}
              label="Avg. response"
              value={data.avgLatencyMs ?? '—'}
              unit={data.avgLatencyMs ? 'ms' : ''}
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <WeekChart data={data} />
            <Totals data={data} />
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <RecentSessions data={data} />
            <TopMistakes data={data} />
          </section>
        </>
      )}
    </div>
  );
}

function Hero({ data }: { data: DashboardData }) {
  const navigate = useNavigate();
  const resume = data.activeSessionId;
  return (
    <section className="relative overflow-hidden rounded-[2rem] bg-ink p-8 text-paper shadow-lift md:p-10">
      <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-coral/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 right-40 size-72 rounded-full bg-sage/30 blur-3xl" />
      <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-paper/70">{greeting()}</p>
            {data.isDemo && (
              <Pill tone="butter" className="!bg-butter/20 !text-butter">
                Demo profile · includes sample history
              </Pill>
            )}
          </div>
          <h1 className="mt-3 font-display text-4xl leading-tight md:text-5xl">
            {resume
              ? 'Pick up right where you left off.'
              : data.streakDays > 0
                ? `Keep your ${data.streakDays}-day streak going.`
                : 'Ten minutes of speaking beats an hour of reading.'}
          </h1>
          <p className="mt-3 text-paper/70">
            Short role-plays with a tutor who listens, lets you interrupt, and quietly notes what to
            fix.
          </p>
        </div>
        <Button
          size="lg"
          className="!bg-coral !text-white hover:!bg-coral-deep"
          onClick={() => navigate(resume ? `/practice/${resume}` : '/practice')}
        >
          {resume ? <PlayCircle className="size-5" /> : <Mic className="size-5" />}
          {resume ? 'Continue session' : "Start today's practice"}
        </Button>
      </div>
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  unit,
  highlight,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  unit: string;
  highlight?: boolean;
}) {
  return (
    <Card className="!p-5">
      <div
        className={cx(
          'flex size-9 items-center justify-center rounded-full [&>svg]:size-4.5',
          highlight ? 'bg-coral text-white' : 'bg-paper-deep text-ink-soft',
        )}
      >
        {icon}
      </div>
      <p className="mt-4 text-sm font-medium text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl">
        {value}
        {unit && <span className="ml-1 font-sans text-sm font-semibold text-muted">{unit}</span>}
      </p>
    </Card>
  );
}

function WeekChart({ data }: { data: DashboardData }) {
  const points = data.last7Days.map((d) => ({
    label: weekdayLabel(d.day),
    minutes: Math.round(d.practiceMs / 6_000) / 10,
  }));
  return (
    <Card className="lg:col-span-2">
      <div className="flex items-baseline justify-between">
        <div>
          <Eyebrow>Last 7 days</Eyebrow>
          <h2 className="mt-1 font-display text-2xl">Minutes practiced</h2>
        </div>
        <p className="text-sm font-semibold text-muted">{formatMinutes(data.weekMs)} total</p>
      </div>
      <div className="mt-6 h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#7a7064', fontSize: 12, fontWeight: 600 }}
            />
            <Tooltip
              cursor={{ fill: 'rgba(31,27,22,0.04)', radius: 12 }}
              contentStyle={{
                borderRadius: 14,
                border: '1px solid #e3d9c7',
                background: '#fffcf6',
                fontSize: 13,
              }}
              formatter={(value) => [`${value} min`, 'Practice']}
            />
            <Bar dataKey="minutes" fill="#e8603c" radius={[10, 10, 10, 10]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function Totals({ data }: { data: DashboardData }) {
  const { voiceMs, textMs } = data.totals;
  const total = voiceMs + textMs;
  const voiceShare = total === 0 ? 0 : Math.round((voiceMs / total) * 100);
  return (
    <Card>
      <Eyebrow>All time</Eyebrow>
      <h2 className="mt-1 font-display text-2xl">How you practice</h2>
      <div className="mt-5">
        <div className="flex h-3 overflow-hidden rounded-full bg-butter-soft">
          <div className="bg-coral transition-all" style={{ width: `${voiceShare}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-xs font-semibold">
          <span className="flex items-center gap-1 text-coral-deep">
            <Mic className="size-3.5" /> Voice {voiceShare}%
          </span>
          <span className="flex items-center gap-1 text-[#8a6416]">
            <Keyboard className="size-3.5" /> Text {100 - voiceShare}%
          </span>
        </div>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <Total icon={<MessageCircle />} label="Sessions" value={data.totals.sessions} />
        <Total icon={<Timer />} label="Practice" value={formatMinutes(data.totals.practiceMs)} />
        <Total icon={<Mic />} label="Turns" value={data.totals.turns} />
        <Total icon={<Target />} label="Goals hit" value={data.totals.goals} />
      </dl>
    </Card>
  );
}

function Total({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl bg-paper p-3">
      <dt className="flex items-center gap-1.5 text-xs font-semibold text-muted [&>svg]:size-3.5">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 font-display text-xl">{value}</dd>
    </div>
  );
}

function RecentSessions({ data }: { data: DashboardData }) {
  return (
    <Card className="lg:col-span-2">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl">Recent sessions</h2>
        <Link to="/practice" className="text-sm font-semibold text-coral-deep hover:underline">
          New session
        </Link>
      </div>
      <ul className="mt-4 divide-y divide-line">
        {data.recent.map((s) => (
          <li key={s.id}>
            <Link
              to={s.status === 'active' ? `/practice/${s.id}` : `/sessions/${s.id}`}
              className="group -mx-3 flex items-center gap-4 rounded-2xl px-3 py-3 transition-colors hover:bg-paper"
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-paper-deep font-display text-lg">
                {languageLabel(s.language).slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{scenarioTitle(s.scenarioId)}</p>
                <p className="text-sm text-muted">
                  {formatDay(s.startedAt)} · {languageLabel(s.language)} · {s.turnCount} turns
                </p>
              </div>
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold">{formatMinutes(s.practiceMs)}</p>
                <p className="text-xs text-muted">{s.goalsCompleted}/3 goals</p>
              </div>
              {s.status === 'active' ? (
                <Pill tone="coral">In progress</Pill>
              ) : (
                <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5" />
              )}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TopMistakes({ data }: { data: DashboardData }) {
  const max = Math.max(1, ...data.topMistakes.map((m) => m.count));
  return (
    <Card>
      <Eyebrow>What to focus on</Eyebrow>
      <h2 className="mt-1 font-display text-2xl">Recurring mistakes</h2>
      {data.topMistakes.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          No corrections yet. Your tutor notes them as you talk.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {data.topMistakes.map((m) => (
            <li key={m.category}>
              <div className="flex justify-between text-sm font-semibold">
                <span>{categoryLabel(m.category)}</span>
                <span className="text-muted">{m.count}</span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-paper-deep">
                <div
                  className="h-2 rounded-full bg-sage"
                  style={{ width: `${(m.count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function EmptyState() {
  const navigate = useNavigate();
  return (
    <Card className="flex flex-col items-center px-8 py-16 text-center">
      <div className="orb size-24" data-state="listening" data-mode="voice" />
      <h2 className="mt-10 font-display text-3xl">Your first conversation is waiting.</h2>
      <p className="mt-3 max-w-md text-muted">
        Pick a scene, say hello, and your stats will start filling in here: minutes practiced, your
        streak, and the mistakes worth working on.
      </p>
      <Button size="lg" className="mt-8" onClick={() => navigate('/practice')}>
        <Mic className="size-5" /> Choose a scenario
      </Button>
    </Card>
  );
}
