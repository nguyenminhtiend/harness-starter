import type { HarnessError } from '../errors.ts';
import type { GenerateRequest, Usage } from '../provider/types.ts';

export interface RunInput {
  conversationId?: string;
  userMessage?: string;
  [key: string]: unknown;
}

export interface RunResult {
  finalMessage?: unknown;
  turns?: number;
  usage?: Usage;
  costUSD?: number;
  checkpoint?: unknown;
  [key: string]: unknown;
}

export interface HarnessEvents {
  'run.start': { runId: string; conversationId: string; input: RunInput };
  'run.finish': { runId: string; result: RunResult };
  'run.error': { runId: string; error: HarnessError };
  'turn.start': { runId: string; turn: number };
  'turn.finish': { runId: string; turn: number; usage: Usage };
  'provider.call': { runId: string; providerId: string; request: GenerateRequest };
  'provider.usage': {
    runId: string;
    tokens: Usage;
    costUSD?: number;
    cache?: { read: number; write: number };
  };
  'provider.retry': { runId: string; attempt: number; delayMs: number; error: unknown };
  'tool.start': { runId: string; toolName: string; args: unknown };
  'tool.approval': { runId: string; approvalId: string; toolName: string; args: unknown };
  'tool.finish': { runId: string; toolName: string; result: unknown; durationMs: number };
  'tool.error': { runId: string; toolName: string; error: HarnessError };
  compaction: { runId: string; droppedTurns: number; summaryTokens: number };
  'structured.repair': { runId: string; attempt: number; issues: unknown };
  guardrail: { runId: string; phase: 'input' | 'output'; action: string };
  handoff: { runId: string; from: string; to: string };
  checkpoint: { runId: string; turn: number; ref: string };
  'budget.exceeded': { runId: string; kind: 'usd' | 'tokens'; spent: number; limit: number };
}

export interface EventBus {
  emit<K extends keyof HarnessEvents>(ev: K, payload: HarnessEvents[K]): void;
  on<K extends keyof HarnessEvents>(
    ev: K,
    handler: (payload: HarnessEvents[K]) => void,
  ): () => void;
}

type Handler = (payload: never) => void;

export function createEventBus(): EventBus {
  const listeners = new Map<string, Handler[]>();

  return {
    emit<K extends keyof HarnessEvents>(ev: K, payload: HarnessEvents[K]): void {
      const handlers = listeners.get(ev as string);
      if (!handlers) {
        return;
      }
      for (const h of handlers) {
        h(payload as never);
      }
    },

    on<K extends keyof HarnessEvents>(
      ev: K,
      handler: (payload: HarnessEvents[K]) => void,
    ): () => void {
      const key = ev as string;
      let handlers = listeners.get(key);
      if (!handlers) {
        handlers = [];
        listeners.set(key, handlers);
      }
      handlers.push(handler as Handler);

      return () => {
        const arr = listeners.get(key);
        if (!arr) {
          return;
        }
        const idx = arr.indexOf(handler as Handler);
        if (idx !== -1) {
          arr.splice(idx, 1);
        }
      };
    },
  };
}
