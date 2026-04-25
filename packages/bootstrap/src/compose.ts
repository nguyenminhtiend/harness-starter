import {
  type ApprovalCoordinator,
  type CapabilityRegistry,
  type Clock,
  type ConversationStore,
  createCryptoIdGen,
  createInMemoryApprovalCoordinator,
  createInMemoryConversationStore,
  createInMemoryEventBus,
  createInMemoryEventLog,
  createInMemoryRunStore,
  createInMemorySettingsStore,
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
  readonly approvalCoordinator: ApprovalCoordinator;
  readonly conversationStore: ConversationStore;
  readonly settingsStore: SettingsStore;
  readonly capabilityRegistry: CapabilityRegistry;
  readonly providerResolver: ProviderResolver;
  readonly providerKeys: ProviderKeys;
  readonly clock: Clock;
  readonly idGen: IdGen;
  readonly logger: Logger;
  readonly executor: RunExecutor;
}

export interface ComposedHarness {
  readonly deps: HarnessDeps;
  readonly shutdown: () => Promise<void>;
}

export function composeHarness(config: HarnessConfig): ComposedHarness {
  const logger = createPinoLogger({ level: config.logLevel ?? 'info' });
  const clock = createSystemClock();
  const idGen = createCryptoIdGen();

  const runStore = createInMemoryRunStore();
  const eventLog = createInMemoryEventLog();
  const eventBus = createInMemoryEventBus();
  const approvalCoordinator = createInMemoryApprovalCoordinator();
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
    approvalCoordinator,
  });

  const deps: HarnessDeps = {
    runStore,
    eventLog,
    eventBus,
    approvalCoordinator,
    conversationStore,
    settingsStore,
    capabilityRegistry,
    providerResolver,
    providerKeys,
    clock,
    idGen,
    logger,
    executor,
  };

  return {
    deps,
    async shutdown() {
      executor.abortAll();
      logger.info('Harness shut down');
    },
  };
}
