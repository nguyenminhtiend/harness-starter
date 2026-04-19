import * as fs from 'node:fs';
import { aiSdkProvider } from '@harness/core';
import { createScorer } from '@harness/eval';
import { llmJudge } from '@harness/eval/scorers';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

if (!process.env.HARNESS_LIVE) {
  console.log('Skipping factuality eval — set HARNESS_LIVE=1 to run');
  process.exit(0);
}

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
});
const provider = aiSdkProvider(
  openrouter.chat(process.env.HARNESS_EVAL_MODEL ?? 'openrouter/auto'),
);

const lines = fs
  .readFileSync(new URL('./fixtures/questions.jsonl', import.meta.url), 'utf-8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l));

const factualityScorer = llmJudge({
  provider,
  prompt: `You are evaluating a research report for factual accuracy.
Rate the report on a scale from 0 to 1:
- 1.0: All claims are factually accurate and well-supported
- 0.5: Some claims are accurate but some are questionable or unsupported
- 0.0: The report contains significant factual errors

Input question: {{input}}
Report output: {{output}}

Respond with ONLY a JSON object: {"score": <number>, "rationale": "<explanation>"}`,
});

export const structureScorer = createScorer({
  name: 'report-structure',
  description: 'Checks that the report has the expected minimum sections',
  scorer: ({ output, expected }) => {
    if (typeof output !== 'string') {
      return 0;
    }
    const sectionCount = (output.match(/^## /gm) || []).length;
    const minSections = (expected as { minSections?: number })?.minSections ?? 2;
    return sectionCount >= minSections ? 1 : sectionCount / minSections;
  },
});

export { factualityScorer, lines as data };
