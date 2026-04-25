import {
  type ApprovalQueue,
  type ApprovalStore,
  type CapabilityRegistry,
  type Clock,
  type ConversationStore,
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
  type EventBus,
  type EventLog,
  type IdGen,
  type Logger,
  loadProviderKeysFromEnv,
  type ProviderKeys,
  type ProviderResolver,
  RunExecutor,
  type RunStore,
  type SettingsStore,
} from '@harness/core';

export interface HarnessConfig {
  capabilityRegistry: CapabilityRegistry;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export interface HarnessDeps {
  readonly runStore: RunStore;
  readonly eventLog: EventLog;
  readonly eventBus: EventBus;
  readonly approvalStore: ApprovalStore;
  readonly approvalQueue: ApprovalQueue;
  readonly conversationStore: ConversationStore;
  readonly settingsStore: SettingsStore;
  readonly capabilityRegistry: CapabilityRegistry;
  readonly providerResolver: ProviderResolver;
  readonly providerKeys: ProviderKeys;
  readonly clock: Clock;
  readonly idGen: IdGen;
  readonly logger: Logger;
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
