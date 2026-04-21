import type { Provider } from '@harness/core';
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
}

export async function generateReport(
  provider: Provider,
  findingsText: string,
  signal: AbortSignal,
  opts?: WriterOpts,
): Promise<Report> {
  const result = await provider.generate(
    {
      messages: [
        { role: 'system', content: opts?.systemPrompt ?? WRITER_PROMPT },
        {
          role: 'user',
          content: `Write a research report from these findings:\n\n${findingsText}`,
        },
      ],
      responseFormat: ReportSchema,
    },
    signal,
  );

  const text = messageTextContent(result.message.content);
  return parseModelJson(text, ReportSchema);
}
