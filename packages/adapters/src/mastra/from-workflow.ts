import type { CapabilityDefinition } from '@harness/core';
import type { Mastra } from '@mastra/core';
import type { z } from 'zod';

export interface FromMastraWorkflowConfig<I, O> {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<I>;
  readonly outputSchema: z.ZodType<O>;
  readonly settingsSchema: z.ZodType;
  readonly supportsApproval?: boolean;
  readonly workflowId: string;
  readonly createMastra: (settings: unknown) => Mastra;
  readonly extractInput: (input: I) => Record<string, unknown>;
  readonly extractPlan: (steps: Record<string, unknown>) => unknown;
  readonly approveStepId: string;
}

export function fromMastraWorkflow<I, O>(
  config: FromMastraWorkflowConfig<I, O>,
): CapabilityDefinition<I, O> {
  return {
    id: config.id,
    title: config.title,
    description: config.description,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,
    settingsSchema: config.settingsSchema,
    ...(config.supportsApproval != null && { supportsApproval: config.supportsApproval }),
    runner: {
      kind: 'workflow',
      build: (settings) => {
        const mastra = config.createMastra(settings);
        return mastra.getWorkflow(config.workflowId);
      },
      extractInput: (input) => config.extractInput(input as I),
      extractPlan: config.extractPlan,
      approveStepId: config.approveStepId,
    },
  };
}
