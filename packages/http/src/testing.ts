import { RunExecutor } from '@harness/core';
import {
  createFakeApprovalCoordinator,
  createFakeClock,
  createFakeConversationStore,
  createFakeEventBus,
  createFakeEventLog,
  createFakeIdGen,
  createFakeLogger,
  createFakeRunStore,
  createFakeSettingsStore,
} from '@harness/core/testing';
import type { HttpAppDeps } from './deps.ts';

export function createFakeHttpDeps(overrides?: Partial<HttpAppDeps>): HttpAppDeps {
  const runStore = createFakeRunStore();
  const eventLog = createFakeEventLog();
  const eventBus = createFakeEventBus();
  const clock = createFakeClock();
  const logger = createFakeLogger();
  const idGen = createFakeIdGen();

  const executor = new RunExecutor({ runStore, eventLog, eventBus, clock, logger });

  return {
    runStore,
    eventLog,
    eventBus,
    approvalCoordinator: createFakeApprovalCoordinator(),
    conversationStore: createFakeConversationStore(),
    settingsStore: createFakeSettingsStore(),
    capabilityRegistry: { list: () => [], get: () => undefined },
    providerResolver: { resolve: () => undefined, list: () => [] },
    providerKeys: {},
    clock,
    idGen,
    logger,
    executor,
    ...overrides,
  };
}
