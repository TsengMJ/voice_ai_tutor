import { randomUUID } from 'node:crypto';
import { inference, llm, log, voice, type JobContext } from '@livekit/agents';
import { DisconnectReason, RoomEvent } from '@livekit/rtc-node';
import {
  ABNORMAL_CLIENT_DISCONNECT,
  DispatchMetadataSchema,
  GREETING_INSTRUCTION,
  LIMITS,
  RESUME_INSTRUCTION,
  RPC_SET_MODE,
  SetModeRequestSchema,
  TIME_UP_INSTRUCTION,
  TOPIC_TUTOR_EVENTS,
  buildTutorInstructions,
  encodeTutorEvent,
  getScenario,
  remainingSessionMs,
  type SessionStore,
  type TutorEvent,
} from '@tutor/core';
import { speechOptionsFor, ttsOptionsFor, type AgentConfig } from './config.js';
import { DisconnectGrace } from './disconnectGrace.js';
import { LatencyTracker } from './latencyTracker.js';
import { ModeController } from './modeController.js';
import { TurnRecorder } from './turnRecorder.js';
import { CompleteGoalArgs, RecordCorrectionArgs, createTutorToolHandlers } from './tutorTools.js';

export async function runTutorSession(ctx: JobContext, store: SessionStore, config: AgentConfig) {
  const logger = log().child({ room: ctx.room.name });

  const metadata = DispatchMetadataSchema.safeParse(safeJson(ctx.job.metadata));
  if (!metadata.success) {
    logger.error('dispatch metadata is missing a valid sessionId; leaving room');
    ctx.shutdown('invalid dispatch metadata');
    return;
  }
  const { sessionId } = metadata.data;

  const state = await store.get(sessionId);
  if (!state || state.status !== 'active' || state.roomName !== ctx.room.name) {
    logger.warn({ sessionId }, 'session is not active for this room; leaving');
    ctx.shutdown('session not active for room');
    return;
  }
  const remaining = remainingSessionMs(state.startedAt, Date.now());
  if (remaining === 0) {
    logger.info({ sessionId }, 'session time limit already reached; leaving');
    ctx.shutdown('session time limit reached');
    return;
  }

  const scenario = getScenario(state.scenarioId);
  const [history, completedGoals] = await Promise.all([
    store.listTurns(sessionId, LIMITS.contextTurns),
    store.listGoals(sessionId),
  ]);

  const chatCtx = llm.ChatContext.empty();
  for (const turn of history) {
    chatCtx.addMessage({ role: turn.role === 'tutor' ? 'assistant' : 'user', content: turn.text });
  }

  const publish = async (event: TutorEvent) => {
    await ctx.room.localParticipant?.publishData(encodeTutorEvent(event), {
      reliable: true,
      topic: TOPIC_TUTOR_EVENTS,
    });
  };

  const handlers = createTutorToolHandlers({
    store,
    sessionId,
    scenario,
    publish,
    now: Date.now,
    newId: randomUUID,
  });

  const agent = new voice.Agent({
    instructions: buildTutorInstructions({
      scenario,
      languageCode: state.language,
      completedGoalIds: completedGoals,
    }),
    chatCtx,
    tools: {
      record_correction: llm.tool({
        description:
          'Silently log a clear language mistake the learner just made so it appears on their feedback card.',
        parameters: RecordCorrectionArgs,
        execute: (args) => handlers.recordCorrection(args),
      }),
      complete_goal: llm.tool({
        description: 'Mark a scenario goal as achieved by the learner.',
        parameters: CompleteGoalArgs,
        execute: (args) => handlers.completeGoal(args),
      }),
    },
  });

  const speech = speechOptionsFor(config.STT_MODEL, state.language);
  const session = new voice.AgentSession({
    stt: new inference.STT({
      model: speech.model,
      language: speech.language,
      modelOptions: speech.modelOptions,
    }),
    llm: new inference.LLM({ model: config.LLM_MODEL, modelOptions: { temperature: 0.8 } }),
    tts: new inference.TTS({
      model: config.TTS_MODEL,
      voice: config.TTS_VOICE,
      language: state.language,
      modelOptions: ttsOptionsFor(config.TTS_MODEL),
    }),
    vad: new inference.VAD(),
    turnDetection: 'stt',
  });

  const modes = new ModeController(
    {
      store,
      sessionId,
      now: Date.now,
      applyAudio: (enabled) => {
        session.input.setAudioEnabled(enabled);
        session.output.setAudioEnabled(enabled);
      },
    },
    state.mode,
  );

  const recorder = new TurnRecorder({
    store,
    sessionId,
    publish,
    currentMode: () => modes.current,
  });

  session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (ev) => {
    if (ev.item.type !== 'message') return;
    const item = ev.item;
    recorder
      .record({
        id: item.id,
        role: item.role,
        text: item.textContent,
        interrupted: item.interrupted,
        createdAt: item.createdAt,
      })
      .catch((err) => logger.error({ err }, 'failed to record turn'));
  });

  const latency = new LatencyTracker({
    expectsAudio: () => modes.current === 'voice',
    onLatency: (ms) => {
      store
        .recordLatency(sessionId, Math.round(ms))
        .catch((err) => logger.error({ err }, 'failed to record latency'));
    },
  });

  session.on(voice.AgentSessionEventTypes.MetricsCollected, ({ metrics: m }) => {
    if (m.type === 'eou_metrics') {
      latency.add({ kind: 'eou', speechId: m.speechId, ms: m.endOfUtteranceDelayMs });
    } else if (m.type === 'llm_metrics' && !m.cancelled && m.ttftMs > 0) {
      latency.add({ kind: 'llm', speechId: m.speechId, ms: m.ttftMs });
    } else if (m.type === 'tts_metrics' && !m.cancelled && m.ttfbMs > 0) {
      latency.add({ kind: 'tts', speechId: m.speechId, ms: m.ttfbMs });
    }
  });

  await session.start({
    agent,
    room: ctx.room,
    inputOptions: {
      textInputCallback: (sess, ev) => {
        recorder.noteTextInput();
        try {
          sess.interrupt();
        } catch {
          // The current speech is uninterruptible; the reply simply queues behind it.
        }
        sess.generateReply({ userInput: ev.text.slice(0, LIMITS.maxTextLength) });
      },
    },
  });
  modes.start();

  ctx.room.localParticipant?.registerRpcMethod(RPC_SET_MODE, async (data) => {
    if (data.callerIdentity !== state.learnerId) throw new Error('not allowed');
    const request = SetModeRequestSchema.parse(safeJson(data.payload));
    await modes.setMode(request.mode);
    await publish({ type: 'mode', mode: request.mode });
    return JSON.stringify({ mode: request.mode });
  });

  const timeLimit = setTimeout(async () => {
    try {
      await publish({ type: 'time_up' });
      await session
        .generateReply({ instructions: TIME_UP_INSTRUCTION, allowInterruptions: false })
        .waitForPlayout();
    } catch (err) {
      logger.warn({ err }, 'time-up wrap-up did not finish cleanly');
    } finally {
      ctx.shutdown('session time limit reached');
    }
  }, remaining);

  const grace = new DisconnectGrace({
    onMute: () => session.output.setAudioEnabled(false),
    onRestore: () => session.output.setAudioEnabled(modes.current === 'voice'),
    onRejoin: () => {
      session
        .generateReply({ instructions: RESUME_INSTRUCTION })
        .waitForPlayout()
        .catch((err: unknown) => {
          logger.warn({ err }, 'resume line after reconnect did not start');
        });
    },
    onExpire: () => {
      void (async () => {
        try {
          await store.setEndReason(sessionId, ABNORMAL_CLIENT_DISCONNECT);
          await ctx.deleteRoom();
        } catch (err) {
          logger.warn({ err, sessionId }, 'failed to record abnormal disconnect');
        } finally {
          ctx.shutdown('abnormal client disconnect');
        }
      })();
    },
  });

  ctx.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    if (participant.identity !== state.learnerId) return;
    const reason = participant.disconnectReason;
    const name = reason === undefined ? undefined : DisconnectReason[reason];
    grace.learnerLeft(typeof name === 'string' ? name : undefined);
  });
  ctx.room.on(RoomEvent.ParticipantConnected, (participant) => {
    if (participant.identity !== state.learnerId) return;
    grace.learnerReturned();
  });

  ctx.addShutdownCallback(async () => {
    grace.cancel();
    clearTimeout(timeLimit);
    await modes.stop();
    await store.markDirty(sessionId);
  });

  session.generateReply({
    instructions: history.length > 0 ? RESUME_INSTRUCTION : GREETING_INSTRUCTION,
  });
}

function safeJson(raw: string | undefined): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
