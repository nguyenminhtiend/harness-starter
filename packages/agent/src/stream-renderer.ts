import type { FinishReason, HarnessError, Usage } from '@harness/core';
import type { AgentEvent } from './types.ts';

export interface StreamRendererCallbacks {
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
  onToolStart?: (id: string, name: string, args: unknown) => void;
  onToolResult?: (id: string, result: unknown, durationMs: number) => void;
  onToolError?: (id: string, error: HarnessError) => void;
  onToolApprovalRequired?: (id: string, name: string, args: unknown) => void;
  onUsage?: (tokens: Usage) => void;
  onFinish?: (reason: FinishReason) => void;
  onTurnStart?: (turn: number) => void;
  onCompaction?: (droppedTurns: number, summaryTokens: number) => void;
  onHandoff?: (from: string, to: string) => void;
  onCheckpoint?: (runId: string, turn: number) => void;
  onBudgetExceeded?: (kind: 'usd' | 'tokens', spent: number, limit: number) => void;
  onAbort?: (reason?: string) => void;
  onError?: (error: unknown) => void;
}

export interface StreamSummary {
  text: string;
  turns: number;
  usage: Usage;
  durationMs: number;
}

export interface StreamRenderer {
  render(stream: AsyncIterable<AgentEvent>): Promise<StreamSummary>;
}

const ZERO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

export function createStreamRenderer(callbacks: StreamRendererCallbacks): StreamRenderer {
  return {
    async render(stream) {
      let text = '';
      let turns = 0;
      let usage: Usage = { ...ZERO_USAGE };
      let startTime: number | undefined;

      try {
        for await (const event of stream) {
          startTime ??= Date.now();
          dispatch(
            callbacks,
            event,
            (delta) => {
              text += delta;
            },
            (u) => {
              usage = addUsage(usage, u);
            },
            () => {
              turns++;
            },
          );
        }
      } catch (error) {
        callbacks.onError?.(error);
      }

      return {
        text,
        turns,
        usage,
        durationMs: startTime != null ? Date.now() - startTime : 0,
      };
    },
  };
}

function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: (a.inputTokens ?? 0) + (b.inputTokens ?? 0),
    outputTokens: (a.outputTokens ?? 0) + (b.outputTokens ?? 0),
    totalTokens: (a.totalTokens ?? 0) + (b.totalTokens ?? 0),
  };
}

function dispatch(
  callbacks: StreamRendererCallbacks,
  event: AgentEvent,
  accText: (delta: string) => void,
  accUsage: (usage: Usage) => void,
  accTurn: () => void,
): void {
  switch (event.type) {
    case 'text-delta':
      accText(event.delta);
      callbacks.onTextDelta?.(event.delta);
      break;
    case 'thinking-delta':
      callbacks.onThinkingDelta?.(event.delta);
      break;
    case 'tool-start':
      callbacks.onToolStart?.(event.id, event.name, event.args);
      break;
    case 'tool-result':
      callbacks.onToolResult?.(event.id, event.result, event.durationMs);
      break;
    case 'tool-error':
      callbacks.onToolError?.(event.id, event.error);
      break;
    case 'tool-approval-required':
      callbacks.onToolApprovalRequired?.(event.id, event.name, event.args);
      break;
    case 'usage':
      accUsage(event.tokens);
      callbacks.onUsage?.(event.tokens);
      break;
    case 'finish':
      callbacks.onFinish?.(event.reason);
      break;
    case 'turn-start':
      accTurn();
      callbacks.onTurnStart?.(event.turn);
      break;
    case 'compaction':
      callbacks.onCompaction?.(event.droppedTurns, event.summaryTokens);
      break;
    case 'handoff':
      callbacks.onHandoff?.(event.from, event.to);
      break;
    case 'checkpoint':
      callbacks.onCheckpoint?.(event.runId, event.turn);
      break;
    case 'budget.exceeded':
      callbacks.onBudgetExceeded?.(event.kind, event.spent, event.limit);
      break;
    case 'abort':
      callbacks.onAbort?.(event.reason);
      break;
    case 'tool-call':
    case 'structured-partial':
    case 'structured.repair':
      break;
    default: {
      const _exhaustive: never = event;
      break;
    }
  }
}
