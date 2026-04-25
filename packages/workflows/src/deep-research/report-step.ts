import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { extractJson } from './json.ts';
import { Finding, ResearchPlan } from './schemas.ts';

const WRITER_INSTRUCTIONS = `You are a report writer. You receive research findings and synthesize them into a structured report.

Guidelines:
- Organize findings into logical sections with clear headings.
- Use inline [n] citations mapped to the references array (1-indexed).
- Every factual claim must have a citation.
- Be thorough but concise.
- The references array must include every URL cited in the report.

Respond with ONLY valid JSON (no markdown fences) matching:
{ "title": "...", "sections": [{ "heading": "...", "body": "..." }], "references": [{ "url": "...", "title": "..." }] }`;

const Section = z.object({ heading: z.string().min(1), body: z.string().min(1) });
const Reference = z.object({ url: z.string(), title: z.string().optional() });
const Report = z.object({
  title: z.string().min(1),
  sections: z.array(Section).min(1),
  references: z.array(Reference).default([]),
});

type Report = z.infer<typeof Report>;

function reportToMarkdown(report: Report): string {
  const lines: string[] = [`# ${report.title}`, ''];
  for (const section of report.sections) {
    lines.push(`## ${section.heading}`, '', section.body, '');
  }
  if (report.references.length > 0) {
    lines.push('## References', '');
    for (const [i, ref] of report.references.entries()) {
      const label = ref.title ?? ref.url;
      lines.push(`${i + 1}. [${label}](${ref.url})`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export interface GenerateReportOptions {
  model: MastraModelConfig;
  findings: Finding[];
  systemPrompt?: string;
  factCheckIssues?: string[];
}

export async function generateReport(opts: GenerateReportOptions): Promise<string> {
  const findingsText = opts.findings
    .map((f) => `[${f.subquestionId}]: ${f.summary}\nSources: ${f.sourceUrls.join(', ') || 'none'}`)
    .join('\n\n');

  const issuesHint =
    opts.factCheckIssues && opts.factCheckIssues.length > 0
      ? `\n\nIMPORTANT — the previous draft failed fact-checking. Fix these issues:\n${opts.factCheckIssues
          .map((i) => `- ${i}`)
          .join('\n')}`
      : '';

  const agent = new Agent({
    id: 'deep-research-writer',
    name: 'Deep Research Writer',
    instructions: opts.systemPrompt ?? WRITER_INSTRUCTIONS,
    model: opts.model,
  });

  const result = await agent.generate(
    `Write a research report from these findings:\n\n${findingsText}${issuesHint}`,
  );

  const text = typeof result.text === 'string' ? result.text : '';
  try {
    const parsed = Report.parse(JSON.parse(extractJson(text)));
    return reportToMarkdown(parsed);
  } catch {
    return text || 'Report generation failed — no output produced.';
  }
}

export interface CreateReportStepOptions {
  model: MastraModelConfig;
  systemPrompt?: string;
}

const inputSchema = z.object({
  question: z.string(),
  plan: ResearchPlan,
  findings: z.array(Finding),
  factCheckIssues: z.array(z.string()).optional(),
});

const outputSchema = z.object({
  question: z.string(),
  plan: ResearchPlan,
  findings: z.array(Finding),
  reportText: z.string(),
});

export function createReportStep(opts: CreateReportStepOptions) {
  return createStep({
    id: 'report',
    description: 'Synthesize findings into a markdown report.',
    inputSchema,
    outputSchema,
    execute: async ({ inputData }) => {
      const reportText = await generateReport({
        model: opts.model,
        findings: inputData.findings,
        ...(opts.systemPrompt ? { systemPrompt: opts.systemPrompt } : {}),
        ...(inputData.factCheckIssues ? { factCheckIssues: inputData.factCheckIssues } : {}),
      });
      return {
        question: inputData.question,
        plan: inputData.plan,
        findings: inputData.findings,
        reportText,
      };
    },
  });
}
