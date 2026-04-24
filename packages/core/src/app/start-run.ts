import { NotFoundError } from '../domain/errors.ts';
import { Run } from '../domain/run.ts';
import type { MemoryProvider } from '../memory/conversation-memory.ts';
import type { Logger } from '../observability/logger.ts';
import type { CapabilityRegistry } from '../ports/capability-registry.ts';
import type { ConversationStore } from '../storage/inmem-conversation-store.ts';
import type { RunStore } from '../storage/inmem-run-store.ts';
import type { Clock } from '../time/clock.ts';
import type { IdGen } from '../time/id-gen.ts';
import type { RunExecutor } from './run-executor.ts';

export interface StartRunDeps {
  readonly capabilityRegistry: CapabilityRegistry;
  readonly runStore: RunStore;
  readonly conversationStore: ConversationStore;
  readonly idGen: IdGen;
  readonly clock: Clock;
  readonly executor: RunExecutor;
  readonly logger: Logger;
  readonly memoryProvider?: MemoryProvider;
}

export interface StartRunInput {
  readonly capabilityId: string;
  readonly input: unknown;
  readonly settings?: unknown;
  readonly conversationId?: string | undefined;
}

export interface StartRunResult {
  readonly runId: string;
}

export async function startRun(
  deps: StartRunDeps,
  params: StartRunInput,
  signal: AbortSignal,
): Promise<StartRunResult> {
  const capability = deps.capabilityRegistry.get(params.capabilityId);
  if (!capability) {
    throw new NotFoundError('Capability', params.capabilityId);
  }

  const runId = deps.idGen.next();
  const createdAt = deps.clock.now();
  const run = new Run(runId, params.capabilityId, createdAt, params.conversationId);

  await deps.runStore.create(runId, params.capabilityId, createdAt, params.conversationId);

  if (params.conversationId) {
    const existing = await deps.conversationStore.get(params.conversationId);
    if (existing) {
      await deps.conversationStore.updateLastActivity(params.conversationId, createdAt);
    } else {
      await deps.conversationStore.create({
        id: params.conversationId,
        capabilityId: params.capabilityId,
        createdAt,
        lastActivityAt: createdAt,
      });
    }
  }

  const memory = params.conversationId
    ? (deps.memoryProvider?.forConversation(params.conversationId) ?? null)
    : null;

  deps.executor
    .execute(run, capability, params.input, signal, {
      settings: params.settings,
      memory,
    })
    .catch((err) => {
      deps.logger.error('RunExecutor unhandled error', {
        runId,
        error: err instanceof Error ? err.message : 'unknown',
      });
    });

  return { runId };
}
