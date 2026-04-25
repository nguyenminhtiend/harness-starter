import {
  createCryptoIdGen,
  createInMemoryApprovalQueue,
  createInMemoryApprovalStore,
  createInMemoryConversationStore,
  createInMemoryEventBus,
  createInMemoryEventLog,
  createInMemoryRunStore,
  createInMemorySettingsStore,
  createNoOpTracer,
  createPinoLogger,
  createProviderResolver,
  createSystemClock,
  loadProviderKeysFromEnv,
  RunExecutor,
} from '@harness/core';
import { createHttpApp } from '@harness/http';
import { createCapabilityRegistry } from '@harness/mastra/capabilities';
import type { Hono } from 'hono';
import type { Config } from './config.ts';

export interface ComposedApp {
  readonly app: Hono;
  readonly shutdown: () => Promise<void>;
}

export function compose(config: Config): ComposedApp {
  const logger = createPinoLogger({ level: config.logLevel });
  const clock = createSystemClock();
  const idGen = createCryptoIdGen();
  const tracer = createNoOpTracer();

  const runStore = createInMemoryRunStore();
  const eventLog = createInMemoryEventLog();
  const eventBus = createInMemoryEventBus();
  const approvalStore = createInMemoryApprovalStore();
  const approvalQueue = createInMemoryApprovalQueue(approvalStore);
  const conversationStore = createInMemoryConversationStore();
  const settingsStore = createInMemorySettingsStore();
  const capabilityRegistry = createCapabilityRegistry();
  const providerResolver = createProviderResolver();
  const providerKeys = loadProviderKeysFromEnv();

  const executor = new RunExecutor({
    runStore,
    eventLog,
    eventBus,
    clock,
    logger,
    approvalQueue,
    tracer,
  });

  const runAbortControllers = new Map<string, AbortController>();

  executor.onComplete((runId) => {
    runAbortControllers.delete(runId);
  });

  const deps = {
    runStore,
    eventLog,
    eventBus,
    approvalStore,
    approvalQueue,
    conversationStore,
    settingsStore,
    capabilityRegistry,
    providerResolver,
    providerKeys,
    clock,
    idGen,
    logger,
    executor,
    runAbortControllers,
  };

  const app = createHttpApp(deps);

  return {
    app,
    async shutdown() {
      for (const controller of runAbortControllers.values()) {
        controller.abort();
      }
      runAbortControllers.clear();
      logger.info('Server shut down');
    },
  };
}
