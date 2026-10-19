import type { Correction } from '@tutor/core/browser';
import { ArrowDown } from 'lucide-react';
import { categoryLabel } from '../lib/format';
import { Pill } from './ui';

export function CorrectionCard({ correction }: { correction: Correction }) {
  return (
    <article className="animate-pop rounded-2xl border border-line bg-card p-4 shadow-soft">
      <Pill tone="sage">{categoryLabel(correction.category)}</Pill>
      <p className="mt-3 text-sm text-muted line-through decoration-coral/60">
        {correction.original}
      </p>
      <ArrowDown className="my-1 size-3.5 text-muted" aria-hidden />
      <p className="text-sm font-semibold text-ink">{correction.corrected}</p>
      <p className="mt-2 text-xs leading-relaxed text-ink-soft">{correction.explanation}</p>
    </article>
  );
}
