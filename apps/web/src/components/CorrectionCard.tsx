import { LANGUAGES, type Correction } from '@tutor/core/browser';
import { ArrowDown, Square, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { categoryLabel } from '../lib/format';
import { browserSynth, speak } from '../lib/speak';
import { Pill } from './ui';

export function CorrectionCard({
  correction,
  language,
}: {
  correction: Correction;
  language: string;
}) {
  return (
    <article className="animate-pop rounded-2xl border border-line bg-card p-4 shadow-soft">
      <Pill tone="sage">{categoryLabel(correction.category)}</Pill>
      <p className="mt-3 text-sm text-muted line-through decoration-coral/60">
        {correction.original}
      </p>
      <ArrowDown className="my-1 size-3.5 text-muted" aria-hidden />
      <PlayableWord text={correction.corrected} language={language} />
      <p className="mt-2 text-xs leading-relaxed text-ink-soft">{correction.explanation}</p>
    </article>
  );
}

const PLAYBACK_ERRORS = {
  unsupported: 'Playback isn’t available in this browser.',
  no_voice: 'This browser has no voice for this language.',
};

function PlayableWord({ text, language }: { text: string; language: string }) {
  const synth = browserSynth();
  const bcp47 = LANGUAGES.find((l) => l.code === language)?.bcp47 ?? language;
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(synth ? null : PLAYBACK_ERRORS.unsupported);
  const playingRef = useRef(false);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => () => void (playingRef.current && synth?.cancel()), [synth]);

  const toggle = () => {
    if (playing) {
      synth?.cancel();
      setPlaying(false);
      return;
    }
    const outcome = speak(synth, text, bcp47, () => setPlaying(false));
    if (outcome === 'started') {
      setError(null);
      setPlaying(true);
    } else {
      setError(PLAYBACK_ERRORS[outcome]);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-ink">{text}</p>
        <button
          type="button"
          onClick={toggle}
          disabled={!synth}
          aria-label={playing ? `Stop ${text}` : `Play ${text}`}
          title={playing ? 'Stop' : 'Listen'}
          className="inline-flex size-7 items-center justify-center rounded-full bg-sage-soft text-sage transition-colors hover:bg-sage hover:text-paper disabled:cursor-not-allowed disabled:opacity-50"
        >
          {playing ? (
            <Square className="size-3 fill-current" aria-hidden />
          ) : (
            <Volume2 className="size-3.5" aria-hidden />
          )}
        </button>
      </div>
      {error && <p className="mt-1 text-xs font-semibold text-coral-deep">{error}</p>}
    </>
  );
}
