import type { CapabilityEvent, TokenUsage } from '@harness/core';

export interface MastraStreamChunk {
  readonly type: string;
  readonly from?: string;
  readonly payload?: Record<string, unknown>;
  readonly [key: string]: unknown;
}

export function mapMastraChunk(chunk: MastraStreamChunk): CapabilityEvent | undefined {
  const p = chunk.payload;

  switch (chunk.type) {
    case 'text-delta':
      return { type: 'text-delta', text: (p?.text as string) ?? '' };

    case 'reasoning':
    case 'reasoning-delta':
      return { type: 'reasoning-delta', text: (p?.text as string) ?? '' };

    case 'tool-call':
      return {
        type: 'tool-called',
        tool: (p?.toolName as string) ?? '',
        args: p?.args ?? null,
        callId: (p?.toolCallId as string) ?? '',
      };

    case 'tool-result':
      return {
        type: 'tool-result',
        callId: (p?.toolCallId as string) ?? '',
        result: p?.result,
      };

    case 'step-finish': {
      const output = p?.output as Record<string, unknown> | undefined;
      const usage = extractUsageFromOutput(output);
      return { type: 'step-finished', ...(usage ? { usage } : {}) };
    }

    case 'finish': {
      const output = p?.output as Record<string, unknown> | undefined;
      const usage = extractUsageFromOutput(output);
      if (usage) {
        return { type: 'usage', usage };
      }
      return undefined;
    }

    case 'start':
    case 'step-start':
    case 'tool-error':
      return undefined;

    default:
      return { type: 'custom', kind: chunk.type, data: p ?? chunk };
  }
}

function extractUsageFromOutput(
  output: Record<string, unknown> | undefined,
): TokenUsage | undefined {
  const raw = output?.usage as Record<string, unknown> | undefined;
  if (!raw) {
    return undefined;
  }
  const inputTokens = typeof raw.inputTokens === 'number' ? raw.inputTokens : undefined;
  const outputTokens = typeof raw.outputTokens === 'number' ? raw.outputTokens : undefined;
  const totalTokens =
    typeof raw.totalTokens === 'number'
      ? raw.totalTokens
      : inputTokens !== undefined || outputTokens !== undefined
        ? (inputTokens ?? 0) + (outputTokens ?? 0)
        : undefined;
  return { inputTokens, outputTokens, totalTokens };
}
