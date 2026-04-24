import type { CapabilityDefinition } from '@harness/core';
import { createLanguageModel } from '@harness/core';
import { createDeepResearchWorkflow } from '@harness/workflows';
import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { withModelOverride } from '../with-model-override.ts';
import { DeepResearchInput, DeepResearchOutput } from './input.ts';
import { DeepResearchSettings } from './settings.ts';

type WorkflowModel = Parameters<typeof createDeepResearchWorkflow>[0]['model'];

function resolveModel(raw: unknown): WorkflowModel {
  if (typeof raw === 'string') {
    return createLanguageModel(raw) as WorkflowModel;
  }
  return raw as WorkflowModel;
}

function buildCapability(
  modelOverride?: unknown,
): CapabilityDefinition<DeepResearchInput, DeepResearchOutput> {
  return {
    id: 'deep-research',
    title: 'Deep Research',
    description:
      'Multi-step research with plan generation, human approval, research, and fact-checked report.',
    inputSchema: DeepResearchInput,
    outputSchema: DeepResearchOutput,
    settingsSchema: DeepResearchSettings,
    supportsApproval: true,
    runner: {
      kind: 'workflow',
      build: (settings) => {
        const s = settings as DeepResearchSettings;
        const model = resolveModel(modelOverride ?? s.model);
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
          storage: new LibSQLStore({ id: 'harness-wf', url: 'file::memory:?cache=shared' }),
        });
        return mastra.getWorkflow('deepResearch');
      },
      extractInput: (input) => ({ question: (input as DeepResearchInput).question }),
      extractPlan: (steps) => {
        const planStep = steps.plan as { status: string; output?: { plan?: unknown } } | undefined;
        return planStep?.status === 'success' ? planStep.output?.plan : undefined;
      },
      approveStepId: 'approve',
    },
  };
}

export const deepResearchCapability = withModelOverride(buildCapability);
