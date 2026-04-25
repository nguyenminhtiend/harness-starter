import type { MastraModelConfig } from '@mastra/core/llm';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import type { StepLogger } from '../lib/logged-step.ts';
import { startStepLog } from '../lib/logged-step.ts';
import { checkFacts } from './fact-check-step.ts';
import { createPlanStep } from './plan-step.ts';
import { generateReport } from './report-step.ts';
import { createResearchStep } from './research-step.ts';
import { Finding, ResearchPlan } from './schemas.ts';

export interface DeepResearchWorkflowOptions {
  model: MastraModelConfig;
  depth?: string | undefined;
  concurrency?: number | undefined;
  maxFactCheckRetries?: number | undefined;
  plannerPrompt?: string | undefined;
  writerPrompt?: string | undefined;
  factCheckerPrompt?: string | undefined;
  logger?: StepLogger | undefined;
}

const approveInputSchema = z.object({
  question: z.string(),
  plan: ResearchPlan,
});

const approveOutputSchema = z.object({
  question: z.string(),
  plan: ResearchPlan,
});

const approveResumeSchema = z.object({
  approved: z.boolean(),
});

function createApproveStep(logger?: StepLogger) {
  return createStep({
    id: 'approve',
    description: 'Suspend for human-in-the-loop plan approval.',
    inputSchema: approveInputSchema,
    outputSchema: approveOutputSchema,
    resumeSchema: approveResumeSchema,
    execute: async ({ inputData, resumeData, suspend }) => {
      const timer = startStepLog(logger, 'approve');
      const { approved } = resumeData ?? {};
      if (!approved) {
        timer.end('success');
        return await suspend({});
      }
      timer.end('success');
      return { question: inputData.question, plan: inputData.plan };
    },
  });
}

const writeAndCheckOutputSchema = z.object({
  question: z.string(),
  plan: ResearchPlan,
  findings: z.array(Finding),
  reportText: z.string(),
  factCheckPassed: z.boolean(),
  factCheckIssues: z.array(z.string()),
  factCheckRetries: z.number(),
});

export function createDeepResearchWorkflow(opts: DeepResearchWorkflowOptions) {
  const maxRetries = opts.maxFactCheckRetries ?? 2;
  const { logger } = opts;

  const planStep = createPlanStep({
    model: opts.model,
    ...(opts.depth ? { depth: opts.depth } : {}),
    ...(opts.plannerPrompt ? { systemPrompt: opts.plannerPrompt } : {}),
    logger,
  });

  const researchStep = createResearchStep({
    model: opts.model,
    ...(opts.concurrency ? { concurrency: opts.concurrency } : {}),
    logger,
  });

  const writeAndCheckStep = createStep({
    id: 'write-and-check',
    description: 'Generate report then fact-check; retries internally up to maxRetries.',
    inputSchema: z.object({
      question: z.string(),
      plan: ResearchPlan,
      findings: z.array(Finding),
    }),
    outputSchema: writeAndCheckOutputSchema,
    execute: async ({ inputData }) => {
      const timer = startStepLog(logger, 'write-and-check');
      try {
        let factCheckIssues: string[] = [];
        let reportText = '';
        let passed = false;

        for (let retry = 0; retry <= maxRetries; retry++) {
          reportText = await generateReport({
            model: opts.model,
            findings: inputData.findings,
            ...(opts.writerPrompt ? { systemPrompt: opts.writerPrompt } : {}),
            ...(factCheckIssues.length > 0 ? { factCheckIssues } : {}),
          });

          const check = await checkFacts({
            model: opts.model,
            reportText,
            findings: inputData.findings,
            ...(opts.factCheckerPrompt ? { systemPrompt: opts.factCheckerPrompt } : {}),
          });

          passed = check.pass;
          factCheckIssues = check.issues;

          if (passed) {
            break;
          }
        }

        timer.end('success');
        return {
          question: inputData.question,
          plan: inputData.plan,
          findings: inputData.findings,
          reportText,
          factCheckPassed: passed,
          factCheckIssues,
          factCheckRetries: Math.min(maxRetries + 1, maxRetries + 1),
        };
      } catch (err) {
        timer.end('error');
        throw err;
      }
    },
  });

  return createWorkflow({
    id: 'deep-research',
    description: 'Plan → approve → research → write + fact-check → report.',
    inputSchema: z.object({ question: z.string() }),
    outputSchema: writeAndCheckOutputSchema,
  })
    .then(planStep)
    .then(createApproveStep(logger))
    .then(researchStep)
    .then(writeAndCheckStep)
    .commit();
}
