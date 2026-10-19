import { randomUUID } from 'node:crypto';
import type { RequestHandler, Response } from 'express';
import { z } from 'zod';

const COOKIE_NAME = 'tutor_lid';
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const LearnerId = z.uuid();

export interface LearnerOptions {
  secure: boolean;
  /** Learner id handed to first-time visitors; a fresh id is generated when absent. */
  defaultLearnerId?: string;
}

/** Anonymous identity: a signed, httpOnly cookie holding a learner UUID. */
export function learnerIdentity(options: LearnerOptions): RequestHandler {
  return (req, res, next) => {
    const existing = req.signedCookies?.[COOKIE_NAME];
    if (LearnerId.safeParse(existing).success) {
      res.locals.learnerId = existing;
      return next();
    }
    const learnerId = options.defaultLearnerId ?? randomUUID();
    res.cookie(COOKIE_NAME, learnerId, {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      secure: options.secure,
      maxAge: ONE_YEAR_MS,
      path: '/',
    });
    res.locals.learnerId = learnerId;
    next();
  };
}

export function learnerIdOf(res: Response): string {
  const id = res.locals.learnerId;
  if (typeof id !== 'string') throw new Error('learnerIdentity middleware did not run');
  return id;
}
