import type { AgentEvent } from '@harness/agent';
import type { EventBus } from '@harness/core';
import type { UIEvent } from './events.ts';

export function agentEventToUIEvents(
  e: AgentEvent,
  runId: string,
  accUsage: { inputTokens: number; outputTokens: number; costUsd: number },
): UIEvent[] {
  const ts = Date.now();
  const base = { ts, runId };
  const events: UIEvent[] = [];

  switch (e.type) {
    case 'turn-start':
      events.push({ ...base, type: 'agent', phase: `turn-${e.turn}` });
      break;
    case 'tool-start':
      events.push({ ...base, type: 'tool', toolName: e.name, args: e.args });
      break;
    case 'tool-result':
      events.push({
        ...base,
        type: 'tool',
        toolName: '',
        result: String(e.result),
        durationMs: e.durationMs,
      });
      break;
    case 'tool-error':
      events.push({ ...base, type: 'tool', toolName: '', isError: true, result: e.error.message });
      break;
    case 'usage': {
      const inp = e.tokens.inputTokens ?? 0;
      const out = e.tokens.outputTokens ?? 0;
      accUsage.inputTokens += inp;
      accUsage.outputTokens += out;
      events.push({
        ...base,
        type: 'metric',
        inputTokens: accUsage.inputTokens,
        outputTokens: accUsage.outputTokens,
        costUsd: accUsage.costUsd,
      });
      break;
    }
    case 'text-delta':
      events.push({ ...base, type: 'writer', delta: e.delta });
      break;
    case 'handoff':
      events.push({ ...base, type: 'agent', phase: e.to, message: `${e.from} → ${e.to}` });
      break;
    case 'checkpoint':
      break;
    case 'budget.exceeded':
      events.push({
        ...base,
        type: 'error',
        message: `Budget exceeded: ${e.kind} (${e.spent}/${e.limit})`,
        code: 'BUDGET_EXCEEDED',
      });
      break;
    case 'abort':
      events.push({ ...base, type: 'error', message: 'Run aborted', code: 'ABORTED' });
      break;
    default:
      break;
  }

  return events;
}

export function bridgeBusToUIEvents(
  bus: EventBus,
  runId: string,
  accUsage: { inputTokens: number; outputTokens: number; costUsd: number },
  push: (ev: UIEvent) => void,
): () => void {
  const unsubs: (() => void)[] = [];
  const ts = () => Date.now();

  unsubs.push(
    bus.on('handoff', (p) => {
      if (p.runId === runId) {
        push({ ts: ts(), runId, type: 'agent', phase: p.to, message: `${p.from} → ${p.to}` });
      }
    }),
  );

  unsubs.push(
    bus.on('tool.start', (p) => {
      if (p.runId === runId) {
        push({ ts: ts(), runId, type: 'tool', toolName: p.toolName, args: p.args });
      }
    }),
  );

  unsubs.push(
    bus.on('tool.finish', (p) => {
      if (p.runId === runId) {
        push({
          ts: ts(),
          runId,
          type: 'tool',
          toolName: '',
          result: String(p.result),
          durationMs: p.durationMs,
        });
      }
    }),
  );

  unsubs.push(
    bus.on('provider.usage', (p) => {
      if (p.runId === runId) {
        accUsage.inputTokens += p.tokens.inputTokens ?? 0;
        accUsage.outputTokens += p.tokens.outputTokens ?? 0;
        if (p.costUSD) {
          accUsage.costUsd += p.costUSD;
        }
        push({
          ts: ts(),
          runId,
          type: 'metric',
          inputTokens: accUsage.inputTokens,
          outputTokens: accUsage.outputTokens,
          costUsd: accUsage.costUsd,
        });
      }
    }),
  );

  return () => {
    for (const u of unsubs) {
      u();
    }
  };
}
