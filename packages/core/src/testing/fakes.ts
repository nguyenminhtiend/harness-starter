import type { Clock } from '../infra/clock.ts';
import type { IdGen } from '../infra/id-gen.ts';
import { createPinoLogger } from '../infra/logger.ts';
import type { MemoryProvider } from '../memory/conversation-memory.ts';
import { createInMemoryApprovalCoordinator } from '../storage/approval-coordinator.ts';
import { createInMemoryConversationStore } from '../storage/conversation-store.ts';
import { createInMemoryEventBus } from '../storage/event-bus.ts';
import { createInMemoryEventLog } from '../storage/event-log.ts';
import { createInMemoryRunStore } from '../storage/run-store.ts';
import { createInMemorySettingsStore } from '../storage/settings-store.ts';

export const createFakeRunStore = createInMemoryRunStore;
export const createFakeEventLog = createInMemoryEventLog;
export const createFakeEventBus = createInMemoryEventBus;
export const createFakeApprovalCoordinator = createInMemoryApprovalCoordinator;
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

export function createFakeLogger() {
  return createPinoLogger({ level: 'silent' });
}

export function createFakeMemoryProvider(): MemoryProvider {
  return {
    forConversation(_conversationId) {
      return null;
    },
  };
}
