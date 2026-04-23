import type { UIEvent } from '@harness/session-events';

export interface AccUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface ChunkLike {
  type: string;
  payload?: Record<string, unknown>;
}

function toResultString(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

/**
 * Translate a single Mastra fullStream chunk into zero or more UIEvents.
 * Keeps the same SSE contract the web-studio UI already expects.
 */
export function mastraChunkToUIEvents(chunk: ChunkLike, runId: string, acc: AccUsage): UIEvent[] {
  const ts = Date.now();
  const base = { ts, runId };
  const p = (chunk.payload ?? {}) as Record<string, unknown>;

  switch (chunk.type) {
    case 'text-delta':
      return [{ ...base, type: 'writer', delta: p.text as string }];

    case 'tool-call':
      return [
        {
          ...base,
          type: 'tool',
          toolName: p.toolName as string,
          callId: p.toolCallId as string,
          args: p.args,
        },
        {
          ...base,
          type: 'llm',
          phase: 'tool-call',
          toolName: p.toolName as string,
          callId: p.toolCallId as string,
          args: p.args,
        },
      ];

    case 'tool-result':
      return [
        {
          ...base,
          type: 'tool',
          toolName: p.toolName as string,
          callId: p.toolCallId as string,
          result: toResultString(p.result),
        },
      ];

    case 'tool-error':
      return [
        {
          ...base,
          type: 'tool',
          toolName: p.toolName as string,
          callId: p.toolCallId as string,
          isError: true,
          result: typeof p.error === 'string' ? p.error : toResultString(p.error),
        },
      ];

    case 'step-finish': {
      const usage = p.totalUsage as { inputTokens?: number; outputTokens?: number } | undefined;
      if (usage) {
        acc.inputTokens = (usage.inputTokens as number) ?? acc.inputTokens;
        acc.outputTokens = (usage.outputTokens as number) ?? acc.outputTokens;
      }
      return [
        {
          ...base,
          type: 'metric',
          inputTokens: acc.inputTokens,
          outputTokens: acc.outputTokens,
          costUsd: acc.costUsd,
        },
      ];
    }

    case 'reasoning-delta':
      return [{ ...base, type: 'llm', phase: 'thinking', text: p.text as string }];

    default:
      return [];
  }
}
