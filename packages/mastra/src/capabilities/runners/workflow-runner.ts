import type { CapabilityRunner } from '@harness/core';
import type { Workflow } from '@mastra/core/workflows';

export interface WorkflowRunnerConfig {
  readonly build: (settings: unknown) => Workflow;
  readonly extractInput: (input: unknown) => Record<string, unknown>;
  readonly approveStepId?: string;
  readonly extractPlan?: (steps: Record<string, unknown>) => unknown;
}

export function workflowRunner(config: WorkflowRunnerConfig): CapabilityRunner {
  return async function* (_input, ctx) {
    const workflow = config.build(ctx.settings);
    const wfRun = await workflow.createRun();
    const inputData = config.extractInput(_input);
    const initial = await wfRun.start({ inputData });

    if (initial.status === 'suspended') {
      const plan = config.extractPlan
        ? config.extractPlan((initial.steps ?? {}) as Record<string, unknown>)
        : undefined;
      yield { type: 'step.finished' as const };
      yield { type: 'plan.proposed' as const, plan };

      const decision = await ctx.approvals.request(`${ctx.runId}-approval`, plan);

      if (decision.kind === 'reject') {
        return;
      }

      if (ctx.signal.aborted) {
        return;
      }

      const resumed = await wfRun.resume({
        step: config.approveStepId ?? 'approve',
        resumeData: {
          approved: true,
          ...(decision.editedPlan !== undefined ? { editedPlan: decision.editedPlan } : {}),
        },
      });

      if (resumed.status === 'success') {
        yield { type: 'artifact' as const, name: 'result', data: resumed.result };
      } else {
        throw new Error(`Workflow failed after resume with status: ${resumed.status}`);
      }
    } else if (initial.status === 'success') {
      yield { type: 'artifact' as const, name: 'result', data: initial.result };
    } else {
      throw new Error(`Workflow failed with status: ${initial.status}`);
    }
  };
}
