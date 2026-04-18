import type { Checkpointer, CheckpointRef, RunState } from '../types.ts';

export function inMemoryCheckpointer(): Checkpointer {
  const store = new Map<string, RunState>();
  const byConversation = new Map<string, CheckpointRef[]>();

  return {
    async save(runId: string, state: RunState): Promise<void> {
      store.set(runId, structuredClone(state));
      const refs = byConversation.get(state.conversationId) ?? [];
      const existing = refs.findIndex((r) => r.runId === runId && r.turn === state.turn);
      const ref: CheckpointRef = {
        runId,
        turn: state.turn,
        createdAt: new Date().toISOString(),
      };
      if (existing >= 0) {
        refs[existing] = ref;
      } else {
        refs.push(ref);
      }
      byConversation.set(state.conversationId, refs);
    },

    async load(runId: string): Promise<RunState | null> {
      const state = store.get(runId);
      return state ? structuredClone(state) : null;
    },

    async list(conversationId: string): Promise<CheckpointRef[]> {
      return byConversation.get(conversationId) ?? [];
    },
  };
}
