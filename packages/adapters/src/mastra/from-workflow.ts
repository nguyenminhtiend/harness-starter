import type { Capability, CapabilityEvent, ExecutionContext } from '@harness/core';
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

export function fromMastraWorkflow<I, O>(config: FromMastraWorkflowConfig<I, O>): Capability<I, O> {
  return {
    id: config.id,
    title: config.title,
    description: config.description,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,
    settingsSchema: config.settingsSchema,
    supportsApproval: config.supportsApproval,

    async *execute(input: I, ctx: ExecutionContext): AsyncIterable<CapabilityEvent> {
      const mastra = config.createMastra(ctx.settings);
      const wf = mastra.getWorkflow(config.workflowId);
      const run = await wf.createRun();

      const inputData = config.extractInput(input);
      const initial = await run.start({ inputData });

      if (initial.status === 'suspended') {
        const plan = config.extractPlan((initial.steps ?? {}) as Record<string, unknown>);
        yield { type: 'step-finished' };
        yield { type: 'plan-proposed', plan };

        const decision = await ctx.approvals.request(`${ctx.runId}-approval`, plan);

        if (decision.kind === 'reject') {
          return;
        }

        if (ctx.signal.aborted) {
          return;
        }

        const resumed = await run.resume({
          step: config.approveStepId,
          resumeData: {
            approved: true,
            ...(decision.editedPlan !== undefined ? { editedPlan: decision.editedPlan } : {}),
          },
        });

        if (resumed.status === 'success') {
          yield { type: 'artifact', name: 'result', data: resumed.result };
        } else {
          yield {
            type: 'custom',
            kind: 'workflow-error',
            data: { status: resumed.status },
          };
        }
      } else if (initial.status === 'success') {
        yield { type: 'artifact', name: 'result', data: initial.result };
      } else {
        yield {
          type: 'custom',
          kind: 'workflow-error',
          data: { status: initial.status },
        };
      }
    },
  };
}
