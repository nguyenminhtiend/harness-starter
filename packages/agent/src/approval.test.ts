import { describe, expect, test } from 'bun:test';
import type { StreamEvent } from '@harness/core';
import { fakeProvider } from '@harness/core/testing';
import { z } from 'zod';
import { createApprovalRegistry } from './approval.ts';
import { createAgent } from './create-agent.ts';
import { tool } from './tool.ts';
import type { AgentEvent } from './types.ts';

function toolCallScript(id: string, name: string, args: unknown): StreamEvent[] {
  return [
    { type: 'tool-call', id, name, args },
    { type: 'usage', tokens: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
    { type: 'finish', reason: 'tool-calls' },
  ];
}

function textScript(text: string): StreamEvent[] {
  return [
    { type: 'text-delta', delta: text },
    { type: 'usage', tokens: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
    { type: 'finish', reason: 'stop' },
  ];
}

describe('ApprovalRegistry', () => {
  test('waitForApproval resolves when resolver.resolve is called', async () => {
    const registry = createApprovalRegistry();

    const promise = registry.waitForApproval('a1', 'test', {});
    registry.resolver.resolve('a1', { approve: true });

    const decision = await promise;
    expect(decision.approve).toBe(true);
  });

  test('denial returns decision with reason', async () => {
    const registry = createApprovalRegistry();

    const promise = registry.waitForApproval('a1', 'test', {});
    registry.resolver.resolve('a1', { approve: false, reason: 'Not allowed' });

    const decision = await promise;
    expect(decision.approve).toBe(false);
    if (!decision.approve) {
      expect(decision.reason).toBe('Not allowed');
    }
  });
});

describe('HITL integration', () => {
  test('tool with requireApproval emits tool-approval-required event', async () => {
    const dangerTool = tool({
      name: 'danger',
      description: 'Dangerous action',
      parameters: z.object({}),
      execute: async () => 'did it',
      requireApproval: 'always',
    });

    const provider = fakeProvider([
      { events: toolCallScript('tc1', 'danger', {}) },
      { events: textScript('Done.') },
    ]);

    const agent = createAgent({ provider, tools: [dangerTool] });
    const events: AgentEvent[] = [];

    // Need to auto-approve in a separate microtask
    const iter = agent.stream({ userMessage: 'do danger' });
    const collect = (async () => {
      for await (const ev of iter) {
        events.push(ev);
        if (ev.type === 'tool-approval-required') {
          // The loop is now waiting — find the approval registry
          // Since we can't access internal registry, we need to approve externally
          // This test just verifies the event is emitted
        }
      }
    })();

    // Auto-resolve approval after a small delay by iterating events
    // Actually, the stream blocks on waitForApproval which never resolves
    // unless we have access to the resolver. Let's verify the event appears
    // by using a timeout approach.

    // For now, we'll test that the registry works in isolation (tested above)
    // and trust that the wiring is correct via the checkpoint integration tests.
    // Skip this test in favor of a direct approval test.
    await Promise.race([collect, new Promise((resolve) => setTimeout(resolve, 100))]);

    const approvalEvent = events.find((e) => e.type === 'tool-approval-required');
    expect(approvalEvent).toBeDefined();
  });
});
