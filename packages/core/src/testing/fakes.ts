import type { Logger } from '../domain/capability.ts';
import type { MemoryProvider } from '../ports/memory-provider.ts';
import { createInMemoryApprovalStore } from '../storage/inmem-approval-store.ts';
import { createInMemoryConversationStore } from '../storage/inmem-conversation-store.ts';
import { createInMemoryEventBus } from '../storage/inmem-event-bus.ts';
import { createInMemoryEventLog } from '../storage/inmem-event-log.ts';
import { createInMemoryRunStore } from '../storage/inmem-run-store.ts';
import { createInMemorySettingsStore } from '../storage/inmem-settings-store.ts';
import type { Clock } from '../time/clock.ts';
import type { IdGen } from '../time/id-gen.ts';

export const createFakeRunStore = createInMemoryRunStore;
export const createFakeEventLog = createInMemoryEventLog;
export const createFakeEventBus = createInMemoryEventBus;
export const createFakeApprovalStore = createInMemoryApprovalStore;
export const createFakeConversationStore = createInMemoryConversationStore;
export const createFakeSettingsStore = createInMemorySettingsStore;

export function createFakeClock(fixed?: string): Clock {
  const ts = fixed ?? '2026-04-24T00:00:00.000Z';
  return {
    now() {
      return ts;
    },
  };
}

export function createFakeIdGen(prefix = '00000000-0000-4000-8000'): IdGen {
  let counter = 0;
  return {
    next() {
      counter++;
      return `${prefix}-${String(counter).padStart(12, '0')}`;
    },
  };
}

export function createFakeLogger(): Logger {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
    child() {
      return createFakeLogger();
    },
  };
}

export function createFakeMemoryProvider(): MemoryProvider {
  return {
    forConversation(_conversationId) {
      return null;
    },
  };
}
