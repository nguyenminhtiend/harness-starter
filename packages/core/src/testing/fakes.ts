import type { MemoryProvider } from '../memory/conversation-memory.ts';
import { createPinoLogger } from '../observability/logger.ts';
import { createInMemoryApprovalStore } from '../storage/memory/approval-store.ts';
import { createInMemoryConversationStore } from '../storage/memory/conversation-store.ts';
import { createInMemoryEventBus } from '../storage/memory/event-bus.ts';
import { createInMemoryEventLog } from '../storage/memory/event-log.ts';
import { createInMemoryRunStore } from '../storage/memory/run-store.ts';
import { createInMemorySettingsStore } from '../storage/memory/settings-store.ts';
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
