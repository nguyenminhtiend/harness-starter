import { fromMastraWorkflow } from '@harness/adapters';
import type { Capability, CapabilityEvent, ExecutionContext } from '@harness/core';
import { createDeepResearchWorkflow } from '@harness/workflows';
import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { DeepResearchInput, DeepResearchOutput } from './input.ts';
import { DeepResearchSettings } from './settings.ts';

type WorkflowModel = Parameters<typeof createDeepResearchWorkflow>[0]['model'];

function buildCapability(
  modelOverride?: unknown,
): Capability<DeepResearchInput, DeepResearchOutput> {
  return fromMastraWorkflow<DeepResearchInput, DeepResearchOutput>({
    id: 'deep-research',
    title: 'Deep Research',
    description:
      'Multi-step research with plan generation, human approval, research, and fact-checked report.',
    inputSchema: DeepResearchInput,
    outputSchema: DeepResearchOutput,
    settingsSchema: DeepResearchSettings,
    supportsApproval: true,
    workflowId: 'deepResearch',
    createMastra: (settings) => {
      const s = settings as DeepResearchSettings;
      const model = (modelOverride ?? s.model) as WorkflowModel;
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
      return new Mastra({
        workflows: { deepResearch: wf },
        storage: new LibSQLStore({ id: 'harness-wf', url: 'file::memory:?cache=shared' }),
      });
    },
    extractInput: (input) => ({ question: input.question }),
    extractPlan: (steps) => {
      const planStep = steps.plan as { status: string; output?: { plan?: unknown } } | undefined;
      return planStep?.status === 'success' ? planStep.output?.plan : undefined;
    },
    approveStepId: 'approve',
  });
}

const base = buildCapability();

export const deepResearchCapability: Capability<DeepResearchInput, DeepResearchOutput> & {
  __createWithModel: (model: unknown) => Capability<DeepResearchInput, DeepResearchOutput>;
} = {
  id: base.id,
  title: base.title,
  description: base.description,
  inputSchema: base.inputSchema,
  outputSchema: base.outputSchema,
  settingsSchema: base.settingsSchema,
  supportsApproval: true,

  execute(input: DeepResearchInput, ctx: ExecutionContext): AsyncIterable<CapabilityEvent> {
    return base.execute(input, ctx);
  },

  __createWithModel(model: unknown) {
    return buildCapability(model);
  },
};
