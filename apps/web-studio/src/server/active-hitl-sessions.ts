import type { Checkpointer } from '@harness/agent';

export interface HitlRunSession {
  checkpointer: Checkpointer;
  abortController: AbortController;
}

const sessions = new Map<string, HitlRunSession>();

export function registerHitlRunSession(runId: string, session: HitlRunSession): void {
  sessions.set(runId, session);
}

export function getHitlRunSession(runId: string): HitlRunSession | undefined {
  return sessions.get(runId);
}

export function unregisterHitlRunSession(runId: string): void {
  sessions.delete(runId);
}
