import { ZodError } from 'zod';
import type { ApprovalDecision, ApprovalRequester } from '../domain/approval.ts';
import type {
  CapabilityDefinition,
  ExecutionContext,
  Logger,
  MemoryHandle,
} from '../domain/capability.ts';
import type { Run } from '../domain/run.ts';
import type { SessionEvent, StreamEventPayload } from '../domain/session-event.ts';
import type { Clock } from '../infra/clock.ts';
import type { ApprovalCoordinator } from '../storage/approval-coordinator.ts';
import type { EventBus } from '../storage/event-bus.ts';
import type { EventLog } from '../storage/event-log.ts';
import type { RunStore } from '../storage/run-store.ts';

export interface RunExecutorDeps {
  readonly runStore: RunStore;
  readonly eventLog: EventLog;
  readonly eventBus: EventBus;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly approvalCoordinator?: ApprovalCoordinator | undefined;
}

export interface RunExecutionParams {
  readonly settings?: unknown;
  readonly memory?: MemoryHandle | null;
}

export type OnRunComplete = (runId: string) => void;

const noopApprovals: ApprovalRequester = {
  request: () => Promise.reject(new Error('Approvals not configured')),
};

export class RunExecutor {
  private readonly deps: RunExecutorDeps;
  private readonly onCompleteCallbacks: OnRunComplete[] = [];
  private readonly abortControllers = new Map<string, AbortController>();

  constructor(deps: RunExecutorDeps) {
    this.deps = deps;
  }

  registerAbort(runId: string, controller: AbortController): void {
    this.abortControllers.set(runId, controller);
  }

  abort(runId: string): boolean {
    const controller = this.abortControllers.get(runId);
    if (!controller) {
      return false;
    }
    controller.abort();
    this.abortControllers.delete(runId);
    return true;
  }

  abortAll(): void {
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    this.abortControllers.clear();
  }

  onComplete(cb: OnRunComplete): void {
    this.onCompleteCallbacks.push(cb);
  }

  private notifyComplete(runId: string): void {
    this.abortControllers.delete(runId);
    for (const cb of this.onCompleteCallbacks) {
      cb(runId);
    }
  }

  private async emit(event: SessionEvent): Promise<void> {
    await this.deps.eventLog.append(event);
    this.deps.eventBus.publish(event);
  }

  private async emitAndSync(event: SessionEvent, run: Run, finishedAt?: string): Promise<void> {
    await this.emit(event);
    await this.deps.runStore.updateStatus(run.id, run.status, finishedAt);
  }

  private createApprovalRequester(run: Run, signal: AbortSignal): ApprovalRequester {
    const { approvalCoordinator, clock } = this.deps;
    if (!approvalCoordinator) {
      return noopApprovals;
    }

    return {
      request: async (approvalId: string, payload: unknown): Promise<ApprovalDecision> => {
        const suspendTs = clock.now();
        const suspendEvent = run.suspendForApproval(approvalId, payload, suspendTs);
        await this.emitAndSync(suspendEvent, run, suspendTs);

        const decision = await Promise.race([
          approvalCoordinator.request(approvalId, run.id, payload, suspendTs),
          new Promise<never>((_resolve, reject) => {
            if (signal.aborted) {
              reject(new Error('Run cancelled during approval'));
              return;
            }
            signal.addEventListener(
              'abort',
              () => reject(new Error('Run cancelled during approval')),
              { once: true },
            );
          }),
        ]);

        const resumeTs = clock.now();
        const resumeEvent = run.resumeFromApproval(approvalId, decision, resumeTs);
        await this.emitAndSync(resumeEvent, run);

        return decision;
      },
    };
  }

  private logStreamEvent(payload: StreamEventPayload, runId: string): void {
    const { logger } = this.deps;
    if (payload.type === 'text.delta' || payload.type === 'reasoning.delta') {
      logger.debug({ runId, type: payload.type, chars: payload.text.length }, 'event');
      return;
    }
    switch (payload.type) {
      case 'tool.called':
        logger.info(
          { runId, type: payload.type, tool: payload.tool, callId: payload.callId },
          'event',
        );
        return;
      case 'tool.result':
        logger.info({ runId, type: payload.type, callId: payload.callId }, 'event');
        return;
      case 'step.finished':
        logger.info(
          { runId, type: payload.type, ...(payload.usage ? { usage: payload.usage } : {}) },
          'event',
        );
        return;
      case 'artifact':
        logger.info({ runId, type: payload.type, name: payload.name }, 'event');
        return;
      case 'plan.proposed':
        logger.info({ runId, type: payload.type }, 'event');
        return;
      case 'usage':
        logger.info({ runId, type: payload.type, usage: payload.usage }, 'event');
        return;
    }
  }

  private async *executeRunner(
    capability: CapabilityDefinition,
    input: unknown,
    ctx: ExecutionContext,
  ): AsyncIterable<StreamEventPayload> {
    yield* capability.runner(input, ctx);
  }

  async execute(
    run: Run,
    capability: CapabilityDefinition,
    input: unknown,
    signal: AbortSignal,
    params?: RunExecutionParams,
  ): Promise<void> {
    const { clock, logger } = this.deps;
    const ts = clock.now();
    const startTime = performance.now();

    logger.info({ runId: run.id, capabilityId: run.capabilityId }, 'Run started');

    await this.emitAndSync(run.start(input, ts), run);

    const rawSettings = params?.settings ?? {};
    let validatedSettings: unknown;
    try {
      validatedSettings = capability.settingsSchema.parse(rawSettings);
    } catch (err) {
      if (err instanceof ZodError) {
        const first = err.issues[0];
        const message = first ? `${first.path.join('.')}: ${first.message}` : 'Invalid settings';
        const failTs = clock.now();
        await this.emitAndSync(
          run.fail({ code: 'INVALID_SETTINGS', message }, failTs),
          run,
          failTs,
        );
        this.deps.eventBus.close(run.id);
        this.notifyComplete(run.id);
        return;
      }
      throw err;
    }

    const ctx: ExecutionContext = {
      runId: run.id,
      settings: validatedSettings,
      memory: params?.memory ?? null,
      signal,
      approvals: this.createApprovalRequester(run, signal),
      logger: logger.child({ runId: run.id }),
    };

    try {
      if (signal.aborted) {
        await this.emitAndSync(run.cancel('Aborted before execution', ts), run, ts);
        return;
      }

      const stream = this.executeRunner(capability, input, ctx);
      for await (const payload of stream) {
        if (signal.aborted) {
          break;
        }
        await this.emit(run.append(payload, clock.now()));
        this.logStreamEvent(payload, run.id);
      }

      const finishTs = clock.now();
      if (signal.aborted && run.status === 'running') {
        await this.emitAndSync(run.cancel('Aborted during execution', finishTs), run, finishTs);
      } else if (run.status === 'running') {
        await this.emitAndSync(run.complete(null, finishTs), run, finishTs);
      }

      const durationMs = Math.round(performance.now() - startTime);
      logger.info(
        { runId: run.id, capabilityId: run.capabilityId, status: run.status, durationMs },
        'Run finished',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const durationMs = Math.round(performance.now() - startTime);
      logger.error(
        { runId: run.id, capabilityId: run.capabilityId, error: message, durationMs },
        'Run failed',
      );

      if (run.status === 'running' || run.status === 'suspended') {
        const failTs = clock.now();
        if (signal.aborted) {
          await this.emitAndSync(run.cancel('Aborted', failTs), run, failTs);
        } else {
          await this.emitAndSync(
            run.fail({ code: 'CAPABILITY_EXECUTION_ERROR', message }, failTs),
            run,
            failTs,
          );
        }
      }
    } finally {
      this.deps.eventBus.close(run.id);
      this.notifyComplete(run.id);
    }
  }
}
