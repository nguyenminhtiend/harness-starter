import type { ApprovalDecision, ApprovalRequester } from '../domain/approval.ts';
import type { ExecutionContext, Logger, MemoryHandle } from '../domain/capability.ts';
import type { Run } from '../domain/run.ts';
import type { SessionEvent } from '../domain/session-event.ts';
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

  private async emit(event: SessionEvent): Promise<void> {
    await this.deps.eventLog.append(event);
    this.deps.eventBus.publish(event);
  }

  private async emitAndSync(event: SessionEvent, run: Run, finishedAt?: string): Promise<void> {
    await this.emit(event);
    await this.deps.runStore.updateStatus(run.id, run.status, finishedAt);
  }

  private createApprovalRequester(run: Run): ApprovalRequester {
    const { approvalQueue, clock } = this.deps;
    if (!approvalQueue) {
      return noopApprovals;
    }

    return {
      request: async (approvalId: string, payload: unknown): Promise<ApprovalDecision> => {
        const suspendTs = clock.now();
        const suspendEvent = run.suspendForApproval(approvalId, payload, suspendTs);
        await this.emitAndSync(suspendEvent, run, suspendTs);

        const decision = await approvalQueue.request(approvalId, run.id, payload, suspendTs);

        const resumeTs = clock.now();
        const resumeEvent = run.resumeFromApproval(approvalId, decision, resumeTs);
        await this.emitAndSync(resumeEvent, run);

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
    const { clock, logger, tracer } = this.deps;
    const ts = clock.now();
    const startTime = performance.now();

    const span = tracer?.startSpan('run.execute', {
      runId: run.id,
      capabilityId: run.capabilityId,
    });

    logger.info('Run started', { runId: run.id, capabilityId: run.capabilityId });

    await this.emitAndSync(run.start(input, ts), run);

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
        await this.emitAndSync(run.cancel('Aborted before execution', ts), run, ts);
        this.deps.eventBus.close(run.id);
        span?.setStatus('ok');
        span?.end();
        return;
      }

      const stream = capability.execute(input, ctx);
      for await (const capEvent of stream) {
        if (signal.aborted) {
          break;
        }
        await this.emit(run.append(capEvent, clock.now()));
      }

      if (signal.aborted && run.status === 'running') {
        await this.emitAndSync(
          run.cancel('Aborted during execution', clock.now()),
          run,
          clock.now(),
        );
      } else if (run.status === 'running') {
        await this.emitAndSync(run.complete(null, clock.now()), run, clock.now());
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
        await this.emitAndSync(
          run.fail({ code: 'CAPABILITY_EXECUTION_ERROR', message }, clock.now()),
          run,
          clock.now(),
        );
      }

      span?.setStatus('error');
    } finally {
      span?.end();
      this.deps.eventBus.close(run.id);
    }
  }
}
