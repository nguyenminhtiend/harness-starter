import type { Checkpointer } from '@harness/agent';

export interface HitlRunSession {
  checkpointer: Checkpointer;
  abortController: AbortController;
}

export interface HitlSessionStore {
  register(runId: string, session: HitlRunSession): void;
  get(runId: string): HitlRunSession | undefined;
  unregister(runId: string): void;
}

export function createHitlSessionStore(): HitlSessionStore {
  const sessions = new Map<string, HitlRunSession>();

  return {
    register(runId, session) {
      sessions.set(runId, session);
    },
    get(runId) {
      return sessions.get(runId);
    },
    unregister(runId) {
      sessions.delete(runId);
    },
  };
}
