import type { CapabilityDefinition } from '@harness/core';
import type { Mastra } from '@mastra/core';
import { workflowAdapter } from '../adapters/index.ts';
import { DeepResearchInput, DeepResearchOutput } from './input.ts';
import { DeepResearchSettings } from './settings.ts';

export interface DeepResearchCapabilityDeps {
  readonly mastra: Mastra;
}

export function createDeepResearchCapability(
  deps: DeepResearchCapabilityDeps,
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
    runner: workflowAdapter({
      workflow: deps.mastra.getWorkflow('deepResearch'),
      extractInput: (input) => ({ question: (input as DeepResearchInput).question }),
      extractPlan: (steps) => {
        const planStep = steps.plan as { status: string; output?: { plan?: unknown } } | undefined;
        return planStep?.status === 'success' ? planStep.output?.plan : undefined;
      },
      approveStepId: 'approve',
    }),
  };
}
