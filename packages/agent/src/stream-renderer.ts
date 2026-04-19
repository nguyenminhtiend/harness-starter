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
              usage = {
                inputTokens: (usage.inputTokens ?? 0) + (u.inputTokens ?? 0),
                outputTokens: (usage.outputTokens ?? 0) + (u.outputTokens ?? 0),
                totalTokens: (usage.totalTokens ?? 0) + (u.totalTokens ?? 0),
              };
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

function dispatch(
  cb: StreamRendererCallbacks,
  event: AgentEvent,
  accText: (delta: string) => void,
  accUsage: (usage: Usage) => void,
  accTurn: () => void,
): void {
  switch (event.type) {
    case 'text-delta':
      accText(event.delta);
      cb.onTextDelta?.(event.delta);
      break;
    case 'thinking-delta':
      cb.onThinkingDelta?.(event.delta);
      break;
    case 'tool-call':
      break;
    case 'tool-start':
      cb.onToolStart?.(event.id, event.name, event.args);
      break;
    case 'tool-result':
      cb.onToolResult?.(event.id, event.result, event.durationMs);
      break;
    case 'tool-error':
      cb.onToolError?.(event.id, event.error);
      break;
    case 'tool-approval-required':
      cb.onToolApprovalRequired?.(event.id, event.name, event.args);
      break;
    case 'usage':
      accUsage(event.tokens);
      cb.onUsage?.(event.tokens);
      break;
    case 'finish':
      cb.onFinish?.(event.reason);
      break;
    case 'turn-start':
      accTurn();
      cb.onTurnStart?.(event.turn);
      break;
    case 'compaction':
      cb.onCompaction?.(event.droppedTurns, event.summaryTokens);
      break;
    case 'handoff':
      cb.onHandoff?.(event.from, event.to);
      break;
    case 'checkpoint':
      cb.onCheckpoint?.(event.runId, event.turn);
      break;
    case 'budget.exceeded':
      cb.onBudgetExceeded?.(event.kind, event.spent, event.limit);
      break;
    case 'abort':
      cb.onAbort?.(event.reason);
      break;
    case 'structured-partial':
    case 'structured.repair':
      break;
  }
}
