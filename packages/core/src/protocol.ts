import { z } from 'zod';
import { CorrectionSchema, MODES, TurnSchema } from './domain.js';

export const AGENT_NAME_DEFAULT = 'voice-tutor';
export const RPC_SET_MODE = 'tutor.set_mode';
export const TOPIC_TUTOR_EVENTS = 'tutor.events';
export const TOPIC_CHAT = 'lk.chat';

export const DispatchMetadataSchema = z.object({ sessionId: z.uuid() });
export type DispatchMetadata = z.infer<typeof DispatchMetadataSchema>;

export const SetModeRequestSchema = z.object({ mode: z.enum(MODES) });
export type SetModeRequest = z.infer<typeof SetModeRequestSchema>;

export const TutorEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('turn'), turn: TurnSchema }),
  z.object({ type: z.literal('correction'), correction: CorrectionSchema }),
  z.object({ type: z.literal('goals'), completed: z.array(z.string()) }),
  z.object({ type: z.literal('mode'), mode: z.enum(MODES) }),
  z.object({ type: z.literal('time_up') }),
]);
export type TutorEvent = z.infer<typeof TutorEventSchema>;

export function encodeTutorEvent(event: TutorEvent): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(event));
}

export function decodeTutorEvent(payload: Uint8Array): TutorEvent | null {
  try {
    const parsed = TutorEventSchema.safeParse(JSON.parse(new TextDecoder().decode(payload)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
