import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { Finding, ResearchPlan } from './schemas.ts';

const URL_RE = /https?:\/\/[^\s)"'<>]+/g;

function extractUrls(text: string): string[] {
  const matches = text.match(URL_RE);
  return matches ? [...new Set(matches)] : [];
}

const FACT_CHECKER_INSTRUCTIONS = `You are a fact-checking assistant. You receive a research report and verify its citations.

For each citation in the report:
1. Check that the cited URL was actually used in the research (provided in context)
2. Check that the claim matches what the source says
3. Flag any unsupported or fabricated citations

Be strict: if any citation cannot be verified, set pass to false.

Respond with ONLY valid JSON (no markdown fences):
{ "pass": true/false, "issues": ["issue 1", "issue 2"] }`;

const FactCheckResult = z.object({
  pass: z.boolean(),
  issues: z.array(z.string()).default([]),
});

type FactCheckResult = z.infer<typeof FactCheckResult>;

function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
  if (fence?.[1]) {
    return fence[1].trim();
  }
  return text.trim();
}

export interface CheckFactsOptions {
  model: MastraModelConfig;
  reportText: string;
  findings: Finding[];
  systemPrompt?: string;
}

export async function checkFacts(opts: CheckFactsOptions): Promise<FactCheckResult> {
  const allSourceUrls = new Set(opts.findings.flatMap((f) => f.sourceUrls));
  const sourceContext = opts.findings
    .map((f) => `[${f.subquestionId}] Sources: ${f.sourceUrls.join(', ') || 'none'}`)
    .join('\n');

  const citedUrls = extractUrls(opts.reportText);
  const unfetchedUrls = citedUrls.filter((u) => !allSourceUrls.has(u));

  let prompt = `Research sources:\n${sourceContext}\n\nVerify citations in this report:\n\n${opts.reportText}`;
  if (unfetchedUrls.length > 0) {
    prompt += `\n\nWARNING: These URLs appear in the report but were NOT found in research sources: ${unfetchedUrls.join(', ')}`;
  }

  const agent = new Agent({
    id: 'deep-research-fact-checker',
    name: 'Deep Research Fact Checker',
    instructions: opts.systemPrompt ?? FACT_CHECKER_INSTRUCTIONS,
    model: opts.model,
  });

  const result = await agent.generate(prompt);
  const text = typeof result.text === 'string' ? result.text : '';
  const parsed = JSON.parse(extractJson(text));
  return FactCheckResult.parse(parsed);
}

export interface CreateFactCheckStepOptions {
  model: MastraModelConfig;
  systemPrompt?: string;
}

const factCheckInputSchema = z.object({
  question: z.string(),
  plan: ResearchPlan,
  findings: z.array(Finding),
  reportText: z.string(),
});

const factCheckOutputSchema = z.object({
  question: z.string(),
  plan: ResearchPlan,
  findings: z.array(Finding),
  reportText: z.string(),
  factCheckPassed: z.boolean(),
  factCheckIssues: z.array(z.string()),
});

export function createFactCheckStep(opts: CreateFactCheckStepOptions) {
  return createStep({
    id: 'fact-check',
    description: 'Verify report citations against research sources.',
    inputSchema: factCheckInputSchema,
    outputSchema: factCheckOutputSchema,
    execute: async ({ inputData }) => {
      const result = await checkFacts({
        model: opts.model,
        reportText: inputData.reportText,
        findings: inputData.findings,
        ...(opts.systemPrompt ? { systemPrompt: opts.systemPrompt } : {}),
      });
      return {
        question: inputData.question,
        plan: inputData.plan,
        findings: inputData.findings,
        reportText: inputData.reportText,
        factCheckPassed: result.pass,
        factCheckIssues: result.issues,
      };
    },
  });
}
