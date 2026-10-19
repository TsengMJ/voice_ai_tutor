import type { Mode } from '@tutor/core/browser';
import { useMultibandTrackVolume, useVoiceAssistant } from '@livekit/components-react';
import type { ConnectionStatus } from './useTutorSession';

const STATE_LABEL: Record<string, string> = {
  disconnected: 'Connecting…',
  connecting: 'Connecting…',
  'pre-connect-buffering': 'Connecting…',
  initializing: 'Your tutor is joining…',
  idle: 'Ready',
  listening: 'Listening',
  thinking: 'Thinking…',
  speaking: 'Speaking',
  failed: 'Connection lost',
};

export function TutorOrb({ mode, status }: { mode: Mode; status: ConnectionStatus }) {
  const { state, audioTrack, agent } = useVoiceAssistant();
  const bands = useMultibandTrackVolume(audioTrack, { bands: 7, loPass: 100, hiPass: 200 });
  const effective = status === 'connected' && !agent ? 'initializing' : state;
  const label =
    mode === 'text' && effective === 'listening'
      ? 'Waiting for your message'
      : STATE_LABEL[effective];

  return (
    <div className="flex flex-col items-center gap-5 py-6">
      <div className="relative flex items-center justify-center">
        <div
          className={mode === 'voice' ? 'orb size-32 md:size-36' : 'orb size-20'}
          data-state={effective}
          data-mode={mode}
        />
        {mode === 'voice' && effective === 'speaking' && (
          <div className="absolute flex h-12 items-center gap-1" aria-hidden>
            {bands.map((v, i) => (
              <span
                key={i}
                className="w-1.5 rounded-full bg-white/90 transition-[height] duration-75"
                style={{ height: `${Math.max(14, Math.min(100, v * 160))}%` }}
              />
            ))}
          </div>
        )}
      </div>
      <p className="text-sm font-semibold text-muted" aria-live="polite">
        {label}
      </p>
    </div>
  );
}
