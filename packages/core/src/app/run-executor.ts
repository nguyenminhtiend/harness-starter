import type { Logger } from '../domain/capability.ts';
import type { Run } from '../domain/run.ts';
import type { Clock } from '../ports/clock.ts';
import type { EventBus } from '../ports/event-bus.ts';
import type { EventLog } from '../ports/event-log.ts';
import type { RunStore } from '../ports/run-store.ts';

export interface RunExecutorDeps {
  readonly runStore: RunStore;
  readonly eventLog: EventLog;
  readonly eventBus: EventBus;
  readonly clock: Clock;
  readonly logger: Logger;
}

interface ExecutableCapability {
  execute(
    input: unknown,
    ctx: { signal: AbortSignal },
  ): AsyncIterable<import('../domain/capability.ts').CapabilityEvent>;
}

export class RunExecutor {
  private readonly deps: RunExecutorDeps;

  constructor(deps: RunExecutorDeps) {
    this.deps = deps;
  }

  async execute(
    run: Run,
    capability: ExecutableCapability,
    input: unknown,
    signal: AbortSignal,
  ): Promise<void> {
    const { runStore, eventLog, eventBus, clock, logger } = this.deps;
    const ts = clock.now();

    const startEvent = run.start(input, ts);
    await eventLog.append(startEvent);
    eventBus.publish(startEvent);
    await runStore.updateStatus(run.id, run.status);

    try {
      if (signal.aborted) {
        const cancelEvent = run.cancel('Aborted before execution', ts);
        await eventLog.append(cancelEvent);
        eventBus.publish(cancelEvent);
        await runStore.updateStatus(run.id, run.status, ts);
        eventBus.close(run.id);
        return;
      }

      const stream = capability.execute(input, { signal });
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Capability execution failed', { runId: run.id, error: message });

      if (run.status === 'running') {
        const failEvent = run.fail({ code: 'CAPABILITY_EXECUTION_ERROR', message }, clock.now());
        await eventLog.append(failEvent);
        eventBus.publish(failEvent);
        await runStore.updateStatus(run.id, run.status, clock.now());
      }
    } finally {
      eventBus.close(run.id);
    }
  }
}
