import {
  CORRECTION_CATEGORIES,
  type Correction,
  type Scenario,
  type SessionStore,
  type TutorEvent,
} from '@tutor/core';
import { z } from 'zod';

export const RecordCorrectionArgs = z.object({
  original: z
    .string()
    .min(1)
    .max(300)
    .describe('What the learner said, quoted as closely as possible'),
  corrected: z.string().min(1).max(300).describe('The natural, correct way to say it'),
  explanation: z.string().min(1).max(400).describe('One short sentence in English explaining why'),
  category: z.enum(CORRECTION_CATEGORIES).describe('The kind of mistake'),
});

export const CompleteGoalArgs = z.object({
  goalId: z.string().describe('The id of the goal the learner just achieved'),
});

export interface ToolDeps {
  store: SessionStore;
  sessionId: string;
  scenario: Scenario;
  publish: (event: TutorEvent) => Promise<void>;
  now: () => number;
  newId: () => string;
}

/** Tool logic, kept independent of the LiveKit runtime so it can be unit tested. */
export function createTutorToolHandlers(deps: ToolDeps) {
  return {
    async recordCorrection(args: z.infer<typeof RecordCorrectionArgs>): Promise<string> {
      const correction: Correction = { id: deps.newId(), ts: deps.now(), ...args };
      await deps.store.addCorrection(deps.sessionId, correction);
      await deps.publish({ type: 'correction', correction });
      return 'Noted. Continue the conversation naturally without mentioning this.';
    },

    async completeGoal({ goalId }: z.infer<typeof CompleteGoalArgs>): Promise<string> {
      if (!deps.scenario.goals.some((g) => g.id === goalId)) {
        const valid = deps.scenario.goals.map((g) => g.id).join(', ');
        return `Unknown goal id "${goalId}". Valid ids: ${valid}.`;
      }
      const completed = await deps.store.completeGoal(deps.sessionId, goalId);
      await deps.publish({ type: 'goals', completed });
      const remaining = deps.scenario.goals.filter((g) => !completed.includes(g.id));
      return remaining.length === 0
        ? 'All goals are done. Wrap up the scene warmly in one or two sentences.'
        : `Goal recorded. Remaining: ${remaining.map((g) => g.text).join('; ')}. Keep the conversation going.`;
    },
  };
}
