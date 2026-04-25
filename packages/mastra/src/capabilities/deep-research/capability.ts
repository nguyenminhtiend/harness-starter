import type { CapabilityDefinition } from '@harness/core';
import { resolveModel } from '@harness/core';
import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { createDeepResearchWorkflow } from '../../workflows/index.ts';
import { workflowRunner } from '../runners/index.ts';
import { DeepResearchInput, DeepResearchOutput } from './input.ts';
import { DeepResearchSettings } from './settings.ts';

type WorkflowModel = Parameters<typeof createDeepResearchWorkflow>[0]['model'];

const sharedStorage = new LibSQLStore({ id: 'harness-wf', url: 'file::memory:?cache=shared' });

export const deepResearchCapability: CapabilityDefinition<DeepResearchInput, DeepResearchOutput> = {
  id: 'deep-research',
  title: 'Deep Research',
  description:
    'Multi-step research with plan generation, human approval, research, and fact-checked report.',
  inputSchema: DeepResearchInput,
  outputSchema: DeepResearchOutput,
  settingsSchema: DeepResearchSettings,
  supportsApproval: true,
  runner: workflowRunner({
    build: (settings) => {
      const s = settings as DeepResearchSettings;
      const model = resolveModel(s.model) as WorkflowModel;
      const wf = createDeepResearchWorkflow({
        model,
        ...(s.depth ? { depth: s.depth } : {}),
        ...(s.maxFactCheckRetries !== undefined
          ? { maxFactCheckRetries: s.maxFactCheckRetries }
          : {}),
        ...(s.plannerPrompt ? { plannerPrompt: s.plannerPrompt } : {}),
        ...(s.writerPrompt ? { writerPrompt: s.writerPrompt } : {}),
        ...(s.factCheckerPrompt ? { factCheckerPrompt: s.factCheckerPrompt } : {}),
      });
      const mastra = new Mastra({
        workflows: { deepResearch: wf },
        storage: sharedStorage,
      });
      return mastra.getWorkflow('deepResearch');
    },
    extractInput: (input) => ({ question: (input as DeepResearchInput).question }),
    extractPlan: (steps) => {
      const planStep = steps.plan as { status: string; output?: { plan?: unknown } } | undefined;
      return planStep?.status === 'success' ? planStep.output?.plan : undefined;
    },
    approveStepId: 'approve',
  }),
};
