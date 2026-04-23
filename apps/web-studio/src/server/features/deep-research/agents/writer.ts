import type { EventBus, Provider } from '@harness/core';
import type { UIEvent } from '@harness/session-events';
import { messageTextContent, parseModelJson } from '../lib/parse-json.ts';
import type { Report } from '../schemas/report.ts';
import { Report as ReportSchema } from '../schemas/report.ts';

const WRITER_PROMPT = `You are a report writer. You receive research findings and synthesize them into a structured report.

Guidelines:
- Organize findings into logical sections with clear headings
- Use inline [n] citations that map to the references array (1-indexed)
- Every factual claim must have a citation
- Be thorough but concise — no filler or repetition
- The references array must include every URL cited in the report`;

export interface WriterOpts {
  systemPrompt?: string | undefined;
  events?: EventBus;
  pushUIEvent?: (ev: UIEvent) => void;
  runId?: string;
}

export async function generateReport(
  provider: Provider,
  findingsText: string,
  signal: AbortSignal,
  opts?: WriterOpts,
): Promise<Report> {
  const runId = opts?.runId ?? 'unknown';
  const messages = [
    { role: 'system' as const, content: opts?.systemPrompt ?? WRITER_PROMPT },
    {
      role: 'user' as const,
      content: `Write a research report from these findings:\n\n${findingsText}`,
    },
  ];

  opts?.pushUIEvent?.({
    type: 'llm',
    ts: Date.now(),
    runId,
    phase: 'request',
    providerId: provider.id,
    messages,
  });
  opts?.events?.emit('provider.call', {
    runId,
    providerId: provider.id,
    request: { messages },
  });

  const result = await provider.generate({ messages, responseFormat: ReportSchema }, signal);

  const text = messageTextContent(result.message.content);

  opts?.pushUIEvent?.({
    type: 'llm',
    ts: Date.now(),
    runId,
    phase: 'response',
    providerId: provider.id,
    text,
  });

  if (result.usage) {
    opts?.events?.emit('provider.usage', {
      runId,
      tokens: result.usage,
    });
  }

  return parseModelJson(text, ReportSchema);
}
