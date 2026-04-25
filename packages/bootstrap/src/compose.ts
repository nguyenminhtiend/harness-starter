import {
  type CapabilityRegistry,
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

export interface HarnessConfig {
  capabilityRegistry: CapabilityRegistry;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export interface HarnessDeps {
  readonly runStore: ReturnType<typeof createInMemoryRunStore>;
  readonly eventLog: ReturnType<typeof createInMemoryEventLog>;
  readonly eventBus: ReturnType<typeof createInMemoryEventBus>;
  readonly approvalStore: ReturnType<typeof createInMemoryApprovalStore>;
  readonly approvalQueue: ReturnType<typeof createInMemoryApprovalQueue>;
  readonly conversationStore: ReturnType<typeof createInMemoryConversationStore>;
  readonly settingsStore: ReturnType<typeof createInMemorySettingsStore>;
  readonly capabilityRegistry: CapabilityRegistry;
  readonly providerResolver: ReturnType<typeof createProviderResolver>;
  readonly providerKeys: ReturnType<typeof loadProviderKeysFromEnv>;
  readonly clock: ReturnType<typeof createSystemClock>;
  readonly idGen: ReturnType<typeof createCryptoIdGen>;
  readonly logger: ReturnType<typeof createPinoLogger>;
  readonly executor: RunExecutor;
  readonly runAbortControllers: Map<string, AbortController>;
}

export interface ComposedHarness {
  readonly deps: HarnessDeps;
  readonly shutdown: () => Promise<void>;
}

export function composeHarness(config: HarnessConfig): ComposedHarness {
  const logger = createPinoLogger({ level: config.logLevel ?? 'info' });
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
  const { capabilityRegistry } = config;
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

  const deps: HarnessDeps = {
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

  return {
    deps,
    async shutdown() {
      for (const controller of runAbortControllers.values()) {
        controller.abort();
      }
      runAbortControllers.clear();
      logger.info('Harness shut down');
    },
  };
}
