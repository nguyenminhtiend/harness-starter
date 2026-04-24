import type { ApprovalDecision, ApprovalRequester } from '../domain/approval.ts';
import type { ExecutionContext, Logger, MemoryHandle } from '../domain/capability.ts';
import type { Run } from '../domain/run.ts';
import type { ApprovalQueue } from '../ports/approval-queue.ts';
import type { Clock } from '../ports/clock.ts';
import type { EventBus } from '../ports/event-bus.ts';
import type { EventLog } from '../ports/event-log.ts';
import type { RunStore } from '../ports/run-store.ts';
import type { Tracer } from '../ports/tracer.ts';

export interface RunExecutorDeps {
  readonly runStore: RunStore;
  readonly eventLog: EventLog;
  readonly eventBus: EventBus;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly approvalQueue?: ApprovalQueue | undefined;
  readonly tracer?: Tracer | undefined;
}

export interface RunExecutionParams {
  readonly settings?: unknown;
  readonly memory?: MemoryHandle | null;
}

interface ExecutableCapability {
  execute(
    input: unknown,
    ctx: ExecutionContext,
  ): AsyncIterable<import('../domain/capability.ts').CapabilityEvent>;
}

const noopApprovals: ApprovalRequester = {
  request: () => Promise.reject(new Error('Approvals not configured')),
};

export class RunExecutor {
  private readonly deps: RunExecutorDeps;

  constructor(deps: RunExecutorDeps) {
    this.deps = deps;
  }

  private createApprovalRequester(run: Run): ApprovalRequester {
    const { approvalQueue, eventLog, eventBus, runStore, clock } = this.deps;
    if (!approvalQueue) {
      return noopApprovals;
    }

    return {
      async request(approvalId: string, payload: unknown): Promise<ApprovalDecision> {
        const suspendTs = clock.now();
        const suspendEvent = run.suspendForApproval(approvalId, payload, suspendTs);
        await eventLog.append(suspendEvent);
        eventBus.publish(suspendEvent);
        await runStore.updateStatus(run.id, run.status, suspendTs);

        const decision = await approvalQueue.request(approvalId, run.id, payload, suspendTs);

        const resumeTs = clock.now();
        const resumeEvent = run.resumeFromApproval(approvalId, decision, resumeTs);
        await eventLog.append(resumeEvent);
        eventBus.publish(resumeEvent);
        await runStore.updateStatus(run.id, run.status);

        return decision;
      },
    };
  }

  async execute(
    run: Run,
    capability: ExecutableCapability,
    input: unknown,
    signal: AbortSignal,
    params?: RunExecutionParams,
  ): Promise<void> {
    const { runStore, eventLog, eventBus, clock, logger, tracer } = this.deps;
    const ts = clock.now();
    const startTime = performance.now();

    const span = tracer?.startSpan('run.execute', {
      runId: run.id,
      capabilityId: run.capabilityId,
    });

    logger.info('Run started', { runId: run.id, capabilityId: run.capabilityId });

    const startEvent = run.start(input, ts);
    await eventLog.append(startEvent);
    eventBus.publish(startEvent);
    await runStore.updateStatus(run.id, run.status);

    const ctx: ExecutionContext = {
      runId: run.id,
      settings: params?.settings ?? {},
      memory: params?.memory ?? null,
      signal,
      approvals: this.createApprovalRequester(run),
      logger: logger.child({ runId: run.id }),
    };

    try {
      if (signal.aborted) {
        const cancelEvent = run.cancel('Aborted before execution', ts);
        await eventLog.append(cancelEvent);
        eventBus.publish(cancelEvent);
        await runStore.updateStatus(run.id, run.status, ts);
        eventBus.close(run.id);
        span?.setStatus('ok');
        span?.end();
        return;
      }

      const stream = capability.execute(input, ctx);
      for await (const capEvent of stream) {
        if (signal.aborted) {
          break;
        }
        const sessionEvent = run.append(capEvent, clock.now());
        await eventLog.append(sessionEvent);
        eventBus.publish(sessionEvent);
      }

      if (signal.aborted && run.status === 'running') {
        const cancelEvent = run.cancel('Aborted during execution', clock.now());
        await eventLog.append(cancelEvent);
        eventBus.publish(cancelEvent);
        await runStore.updateStatus(run.id, run.status, clock.now());
      } else if (run.status === 'running') {
        const completeEvent = run.complete(null, clock.now());
        await eventLog.append(completeEvent);
        eventBus.publish(completeEvent);
        await runStore.updateStatus(run.id, run.status, clock.now());
      }

      const durationMs = Math.round(performance.now() - startTime);
      logger.info('Run completed', {
        runId: run.id,
        capabilityId: run.capabilityId,
        status: run.status,
        durationMs,
      });
      span?.setStatus('ok');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const durationMs = Math.round(performance.now() - startTime);
      logger.error('Run failed', {
        runId: run.id,
        capabilityId: run.capabilityId,
        error: message,
        durationMs,
      });

      if (run.status === 'running') {
        const failEvent = run.fail({ code: 'CAPABILITY_EXECUTION_ERROR', message }, clock.now());
        await eventLog.append(failEvent);
        eventBus.publish(failEvent);
        await runStore.updateStatus(run.id, run.status, clock.now());
      }

      span?.setStatus('error');
    } finally {
      span?.end();
      eventBus.close(run.id);
    }
  }
}
