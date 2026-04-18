import type { Message, Provider } from '@harness/core';
import type { CompactionContext, Compactor } from '../types.ts';

export interface SummarizingCompactorOpts {
  maxTokens?: number;
  keepLastN?: number;
  summarizer?: Provider;
}

const DEFAULT_MAX_TOKENS = 80_000;
const DEFAULT_KEEP_LAST_N = 4;

export function summarizingCompactor(opts?: SummarizingCompactorOpts): Compactor {
  const maxTokens = opts?.maxTokens ?? DEFAULT_MAX_TOKENS;
  const keepLastN = opts?.keepLastN ?? DEFAULT_KEEP_LAST_N;

  return {
    async compact(messages: Message[], ctx: CompactionContext): Promise<Message[]> {
      const estimated = estimateTokens(messages);
      if (estimated <= maxTokens) {
        return messages;
      }

      const systemMsgs = messages.filter((m) => m.role === 'system');
      const nonSystem = messages.filter((m) => m.role !== 'system');

      if (nonSystem.length <= keepLastN) {
        return messages;
      }

      const kept = nonSystem.slice(-keepLastN);
      const toSummarize = nonSystem.slice(0, -keepLastN);

      const summaryText = await summarize(
        toSummarize,
        opts?.summarizer ?? ctx.provider,
        ctx.signal,
      );

      const summaryMsg: Message = {
        role: 'user',
        content: `[Summary of previous ${toSummarize.length} messages]: ${summaryText}`,
      };

      return [...systemMsgs, summaryMsg, ...kept];
    },
  };
}

function estimateTokens(messages: Message[]): number {
  let total = 0;
  for (const m of messages) {
    const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    total += Math.ceil(text.length / 4);
  }
  return total;
}

async function summarize(
  messages: Message[],
  provider: Provider,
  signal: AbortSignal,
): Promise<string> {
  const content = messages
    .map(
      (m) => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`,
    )
    .join('\n');

  const result = await provider.generate(
    {
      messages: [
        {
          role: 'system',
          content:
            'Summarize the following conversation concisely, preserving key facts and decisions.',
        },
        { role: 'user', content },
      ],
    },
    signal,
  );

  return typeof result.message.content === 'string'
    ? result.message.content
    : JSON.stringify(result.message.content);
}
