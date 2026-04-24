import {
  createCryptoIdGen,
  createInMemoryApprovalStore,
  createInMemoryConversationStore,
  createInMemoryEventBus,
  createInMemoryEventLog,
  createInMemoryRunStore,
  createInMemorySettingsStore,
  createPinoLogger,
  createSystemClock,
} from '@harness/adapters';
import { createCapabilityRegistry } from '@harness/capabilities';
import { RunExecutor } from '@harness/core';
import { createHttpApp } from '@harness/http';
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

  const runStore = createInMemoryRunStore();
  const eventLog = createInMemoryEventLog();
  const eventBus = createInMemoryEventBus();
  const approvalStore = createInMemoryApprovalStore();
  const conversationStore = createInMemoryConversationStore();
  const settingsStore = createInMemorySettingsStore();
  const capabilityRegistry = createCapabilityRegistry();

  const executor = new RunExecutor({ runStore, eventLog, eventBus, clock, logger });

  const runAbortControllers = new Map<string, AbortController>();

  const deps = {
    runStore,
    eventLog,
    eventBus,
    approvalStore,
    conversationStore,
    settingsStore,
    capabilityRegistry,
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
