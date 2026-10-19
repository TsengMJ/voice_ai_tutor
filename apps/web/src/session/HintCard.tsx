import type { Hint } from '@tutor/core/browser';
import { Lightbulb } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../components/ui';
import { api } from '../lib/api';

export function HintCard({
  sessionId,
  disabled,
  onUse,
}: {
  sessionId: string;
  disabled: boolean;
  onUse: (text: string) => void;
}) {
  const [hint, setHint] = useState<Hint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    setLoading(true);
    setError(null);
    try {
      setHint(await api.hint(sessionId));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-3xl border border-butter/60 bg-butter-soft/70 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-bold text-[#8a6416]">
          <Lightbulb className="size-4" /> Stuck?
        </p>
        <Button size="sm" variant="secondary" loading={loading} disabled={disabled} onClick={ask}>
          {hint ? 'Another idea' : 'Get a hint'}
        </Button>
      </div>
      {hint && (
        <div className="mt-4 animate-pop">
          <p className="font-display text-lg leading-snug">“{hint.suggestion}”</p>
          {hint.translation && hint.translation !== hint.suggestion && (
            <p className="mt-1 text-xs text-ink-soft">{hint.translation}</p>
          )}
          <button
            onClick={() => onUse(hint.suggestion)}
            className="mt-3 text-xs font-bold text-coral-deep hover:underline"
          >
            Put it in the message box
          </button>
        </div>
      )}
      {error && <p className="mt-3 text-xs font-semibold text-coral-deep">{error}</p>}
    </div>
  );
}
