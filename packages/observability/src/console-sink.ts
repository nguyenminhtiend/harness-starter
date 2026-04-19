import type { EventBus, HarnessEvents } from '@harness/core';

export type ConsoleSinkLevel = 'silent' | 'quiet' | 'normal' | 'verbose';

export interface ConsoleSinkOpts {
  level?: ConsoleSinkLevel;
}

const QUIET_EVENTS: ReadonlySet<keyof HarnessEvents> = new Set([
  'run.start',
  'run.finish',
  'run.error',
  'budget.exceeded',
]);

const NORMAL_EVENTS: ReadonlySet<keyof HarnessEvents> = new Set([
  ...QUIET_EVENTS,
  'turn.start',
  'turn.finish',
  'tool.start',
  'tool.finish',
  'tool.error',
  'tool.approval',
  'guardrail',
  'handoff',
  'compaction',
  'checkpoint',
]);

const VERBOSE_EVENTS: ReadonlySet<keyof HarnessEvents> = new Set([
  ...NORMAL_EVENTS,
  'provider.call',
  'provider.usage',
  'provider.retry',
  'structured.repair',
]);

function eventsForLevel(level: ConsoleSinkLevel): ReadonlySet<keyof HarnessEvents> {
  switch (level) {
    case 'silent':
      return new Set();
    case 'quiet':
      return QUIET_EVENTS;
    case 'normal':
      return NORMAL_EVENTS;
    case 'verbose':
      return VERBOSE_EVENTS;
  }
}

type Payload = HarnessEvents[keyof HarnessEvents];

function formatEvent(eventName: keyof HarnessEvents, payload: Payload): string {
  const p = payload as Record<string, unknown>;

  switch (eventName) {
    case 'run.start': {
      const runId = shortId(p.runId as string);
      return `[run] started ${runId}`;
    }
    case 'run.finish': {
      const result = p.result as Record<string, unknown> | undefined;
      const usage = result?.usage as Record<string, unknown> | undefined;
      const tokens = usage?.totalTokens ?? '?';
      const turns = result?.turns ?? '?';
      return `[run] done · ${tokens} tokens · ${turns} turns`;
    }
    case 'run.error': {
      const error = p.error as { message?: string } | undefined;
      return `[error] ${error?.message ?? 'unknown error'}`;
    }
    case 'budget.exceeded':
      return `[budget] ${p.kind} exceeded: ${p.spent}/${p.limit}`;
    case 'turn.start':
      return `[turn] ${p.turn}`;
    case 'turn.finish': {
      const usage = p.usage as Record<string, unknown> | undefined;
      const tokens = usage?.totalTokens ?? '?';
      return `[turn] ${p.turn} done · ${tokens} tokens`;
    }
    case 'tool.start':
      return `[tool] ${p.toolName} called`;
    case 'tool.finish':
      return `[tool] ${p.toolName} done · ${p.durationMs}ms`;
    case 'tool.error': {
      const error = p.error as { message?: string } | undefined;
      return `[tool] ${p.toolName} error: ${error?.message ?? 'unknown'}`;
    }
    case 'tool.approval':
      return `[tool] ${p.toolName} awaiting approval`;
    case 'guardrail':
      return `[guardrail] ${p.phase} → ${p.action}`;
    case 'handoff':
      return `[handoff] ${p.from} → ${p.to}`;
    case 'compaction':
      return `[compaction] dropped ${p.droppedTurns} turns · ${p.summaryTokens} summary tokens`;
    case 'checkpoint':
      return `[checkpoint] turn ${p.turn}`;
    case 'provider.call':
      return `[provider] call to ${p.providerId}`;
    case 'provider.usage': {
      const tokens = p.tokens as Record<string, unknown> | undefined;
      const total = tokens?.totalTokens ?? '?';
      const cost = p.costUSD != null ? ` · $${p.costUSD}` : '';
      return `[provider] ${total} tokens${cost}`;
    }
    case 'provider.retry':
      return `[provider] retry #${p.attempt} in ${p.delayMs}ms`;
    case 'structured.repair':
      return `[structured] repair attempt ${p.attempt}`;
    default:
      return `[${eventName}]`;
  }
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

export function consoleSink(bus: EventBus, opts?: ConsoleSinkOpts): () => void {
  const level = opts?.level ?? 'normal';
  const allowed = eventsForLevel(level);
  const unsubs: (() => void)[] = [];

  for (const eventName of allowed) {
    const unsub = bus.on(eventName, (payload: HarnessEvents[typeof eventName]) => {
      console.log(formatEvent(eventName, payload));
    });
    unsubs.push(unsub);
  }

  return () => {
    for (const unsub of unsubs) {
      unsub();
    }
  };
}
