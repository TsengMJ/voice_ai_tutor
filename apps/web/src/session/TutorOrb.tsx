import type { Mode } from '@tutor/core/browser';
import { useMultibandTrackVolume, useVoiceAssistant } from '@livekit/components-react';
import { cx } from '../components/ui';
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
  reconnecting: 'Reconnecting…',
  failed: 'Connection lost',
};

const ONLINE_STATES = new Set(['idle', 'listening', 'thinking', 'speaking']);

export function TutorOrb({
  mode,
  status,
  name,
}: {
  mode: Mode;
  status: ConnectionStatus;
  name: string;
}) {
  const { state, audioTrack, agent } = useVoiceAssistant();
  const bands = useMultibandTrackVolume(audioTrack, { bands: 5, loPass: 100, hiPass: 200 });
  const effective =
    status === 'reconnecting'
      ? 'reconnecting'
      : status === 'connected' && !agent
        ? 'initializing'
        : state;
  const label =
    mode === 'text' && effective === 'listening'
      ? 'Waiting for your message'
      : STATE_LABEL[effective];
  const online = ONLINE_STATES.has(effective);

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="relative flex shrink-0 items-center justify-center">
        <div className="orb orb-avatar size-11" data-state={effective} data-mode={mode} />
        {mode === 'voice' && effective === 'speaking' && (
          <div className="absolute flex h-5 items-center gap-0.5" aria-hidden>
            {bands.map((v, i) => (
              <span
                key={i}
                className="w-1 rounded-full bg-white/90 transition-[height] duration-75"
                style={{ height: `${Math.max(20, Math.min(100, v * 160))}%` }}
              />
            ))}
          </div>
        )}
        <span
          className={cx(
            'absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-card',
            online ? 'bg-sage' : 'bg-line',
          )}
          aria-hidden
        />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[15px] font-bold leading-tight first-letter:uppercase">
          {name}
        </p>
        <p className="truncate text-xs font-semibold text-muted" aria-live="polite">
          {label}
        </p>
      </div>
    </div>
  );
}
