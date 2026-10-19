import type { Goal } from '@tutor/core/browser';
import { Check } from 'lucide-react';
import { cx } from './ui';

export function GoalList({ goals, completed }: { goals: Goal[]; completed: string[] }) {
  return (
    <ol className="space-y-2.5">
      {goals.map((goal) => {
        const done = completed.includes(goal.id);
        return (
          <li key={goal.id} className="flex items-start gap-3">
            <span
              className={cx(
                'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300',
                done ? 'animate-pop border-sage bg-sage text-white' : 'border-line bg-card',
              )}
              aria-hidden
            >
              {done && <Check className="size-3" strokeWidth={3} />}
            </span>
            <span
              className={cx('text-sm leading-snug', done ? 'text-muted line-through' : 'text-ink')}
            >
              {goal.text}
              <span className="sr-only">{done ? ' (done)' : ''}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
