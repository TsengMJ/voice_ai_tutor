import {
  LIMITS,
  RPC_SET_MODE,
  TOPIC_CHAT,
  TOPIC_TUTOR_EVENTS,
  decodeTutorEvent,
  type Correction,
  type Mode,
  type SessionReview,
  type Turn,
} from '@tutor/core/browser';
import { Room, RoomEvent, type RemoteParticipant } from 'livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

export type ConnectionStatus = 'connecting' | 'connected' | 'failed';

export interface PendingMessage {
  key: string;
  text: string;
}

function findAgent(room: Room): RemoteParticipant | undefined {
  return [...room.remoteParticipants.values()].find((p) => p.isAgent);
}

/**
 * Owns the LiveKit room for one practice session: connection, mode switching,
 * typed input, and the tutor events (turns, corrections, goals) the agent publishes.
 */
export function useTutorSession(sessionId: string, initial: SessionReview, initialMode: Mode) {
  const [room] = useState(
    () =>
      new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      }),
  );
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>(initial.turns);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [corrections, setCorrections] = useState<Correction[]>(initial.corrections);
  const [completedGoals, setCompletedGoals] = useState<string[]>(initial.session.completedGoals);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [timeUp, setTimeUp] = useState(false);
  const [deadline] = useState(() => Date.now() + initial.session.remainingMs);
  const [attempt, setAttempt] = useState(0);
  const modeRef = useRef(initialMode);

  const applyMode = useCallback((next: Mode) => {
    modeRef.current = next;
    setMode(next);
  }, []);

  const enableMicrophone = useCallback(
    async (enabled: boolean) => {
      try {
        await room.localParticipant.setMicrophoneEnabled(enabled);
        return true;
      } catch {
        setNotice('Microphone access was blocked, so we switched you to Text mode.');
        applyMode('text');
        return false;
      }
    },
    [room, applyMode],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const details = await api.connect(sessionId, modeRef.current);
        if (cancelled) return;
        await room.connect(details.serverUrl, details.token);
        if (cancelled) return;
        if (modeRef.current === 'voice') await enableMicrophone(true);
        setStatus('connected');
      } catch (err) {
        if (cancelled) return;
        setStatus('failed');
        setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      void room.disconnect();
    };
  }, [room, sessionId, attempt, enableMicrophone]);

  useEffect(() => {
    const onData = (
      payload: Uint8Array,
      participant?: RemoteParticipant,
      _kind?: unknown,
      topic?: string,
    ) => {
      if (topic !== TOPIC_TUTOR_EVENTS || !participant?.isAgent) return;
      const event = decodeTutorEvent(payload);
      if (!event) return;
      switch (event.type) {
        case 'turn': {
          const turn = event.turn;
          setTurns((prev) => (prev.some((t) => t.id === turn.id) ? prev : [...prev, turn]));
          if (turn.role === 'learner' && turn.modality === 'text') {
            setPending((prev) => {
              const index = prev.findIndex((p) => p.text === turn.text);
              return index === -1 ? prev.slice(1) : prev.filter((_, i) => i !== index);
            });
          }
          break;
        }
        case 'correction':
          setCorrections((prev) =>
            prev.some((c) => c.id === event.correction.id) ? prev : [...prev, event.correction],
          );
          break;
        case 'goals':
          setCompletedGoals(event.completed);
          break;
        case 'mode':
          applyMode(event.mode);
          break;
        case 'time_up':
          setTimeUp(true);
          break;
      }
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room, applyMode]);

  const switchMode = useCallback(
    async (next: Mode) => {
      if (next === modeRef.current) return;
      const agent = findAgent(room);
      if (!agent) {
        setNotice('Your tutor is still joining. Try again in a moment.');
        return;
      }
      const previous = modeRef.current;
      applyMode(next);
      setNotice(null);
      if (next === 'voice' && !(await enableMicrophone(true))) return;
      if (next === 'text') await enableMicrophone(false);
      try {
        await room.localParticipant.performRpc({
          destinationIdentity: agent.identity,
          method: RPC_SET_MODE,
          payload: JSON.stringify({ mode: next }),
        });
      } catch {
        applyMode(previous);
        await enableMicrophone(previous === 'voice');
        setNotice("Couldn't switch modes. Please try again.");
      }
    },
    [room, enableMicrophone, applyMode],
  );

  const sendText = useCallback(
    async (raw: string) => {
      const text = raw.trim().slice(0, LIMITS.maxTextLength);
      if (!text) return;
      const key = `${Date.now()}-${Math.random()}`;
      setPending((prev) => [...prev, { key, text }]);
      try {
        await room.localParticipant.sendText(text, { topic: TOPIC_CHAT });
      } catch {
        setPending((prev) => prev.filter((p) => p.key !== key));
        setNotice("That message didn't send. Check your connection and try again.");
      }
    },
    [room],
  );

  const setMicMuted = useCallback(
    (muted: boolean) => room.localParticipant.setMicrophoneEnabled(!muted),
    [room],
  );

  const disconnect = useCallback(() => room.disconnect(), [room]);
  const retry = useCallback(() => {
    setStatus('connecting');
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  return {
    room,
    status,
    error,
    notice,
    dismissNotice: () => setNotice(null),
    turns,
    pending,
    corrections,
    completedGoals,
    mode,
    timeUp,
    deadline,
    switchMode,
    sendText,
    setMicMuted,
    disconnect,
    retry,
  };
}

export type TutorSession = ReturnType<typeof useTutorSession>;
