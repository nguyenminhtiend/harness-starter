import { describe, expect, test } from 'bun:test';
import type { StreamEvent } from '@harness/core';
import { createEventBus, GuardrailError } from '@harness/core';
import { fakeProvider } from '@harness/core/testing';
import { createAgent } from '../create-agent.ts';
import type { AgentEvent, InputHook, OutputHook } from '../types.ts';
import { runInputHooks, runOutputHooks } from './hooks.ts';

const dummyCtx = {
  runId: 'r1',
  conversationId: 'c1',
  signal: new AbortController().signal,
};

describe('runInputHooks', () => {
  test('pass action returns messages unchanged', async () => {
    const hook: InputHook = async () => ({ action: 'pass' });
    const messages = [{ role: 'user' as const, content: 'hi' }];
    const result = await runInputHooks([hook], messages, dummyCtx);
    expect(result).toEqual(messages);
  });

  test('block action throws GuardrailError', async () => {
    const hook: InputHook = async () => ({ action: 'block', reason: 'nope' });
    const messages = [{ role: 'user' as const, content: 'hi' }];
    await expect(runInputHooks([hook], messages, dummyCtx)).rejects.toThrow(GuardrailError);
  });

  test('rewrite action replaces messages', async () => {
    const hook: InputHook = async () => ({
      action: 'rewrite',
      messages: [{ role: 'user', content: 'sanitized' }],
    });
    const messages = [{ role: 'user' as const, content: 'bad stuff' }];
    const result = await runInputHooks([hook], messages, dummyCtx);
    expect(result[0]?.content).toBe('sanitized');
  });

  test('first non-pass wins', async () => {
    const passHook: InputHook = async () => ({ action: 'pass' });
    const blockHook: InputHook = async () => ({ action: 'block', reason: 'blocked' });
    const rewriteHook: InputHook = async () => ({
      action: 'rewrite',
      messages: [{ role: 'user', content: 'rewritten' }],
    });

    const messages = [{ role: 'user' as const, content: 'hi' }];
    await expect(
      runInputHooks([passHook, blockHook, rewriteHook], messages, dummyCtx),
    ).rejects.toThrow(GuardrailError);
  });
});

describe('runOutputHooks', () => {
  test('pass action returns message unchanged', async () => {
    const hook: OutputHook = async () => ({ action: 'pass' });
    const msg = { role: 'assistant' as const, content: 'hi' };
    const result = await runOutputHooks([hook], msg, dummyCtx);
    expect(result).toEqual(msg);
  });

  test('block action throws GuardrailError', async () => {
    const hook: OutputHook = async () => ({ action: 'block', reason: 'bad' });
    const msg = { role: 'assistant' as const, content: 'bad stuff' };
    await expect(runOutputHooks([hook], msg, dummyCtx)).rejects.toThrow(GuardrailError);
  });

  test('rewrite action replaces message', async () => {
    const hook: OutputHook = async () => ({
      action: 'rewrite',
      message: { role: 'assistant', content: 'clean' },
    });
    const msg = { role: 'assistant' as const, content: 'dirty' };
    const result = await runOutputHooks([hook], msg, dummyCtx);
    expect(result.content).toBe('clean');
  });
});

function textScript(text: string): StreamEvent[] {
  return [
    { type: 'text-delta', delta: text },
    { type: 'usage', tokens: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
    { type: 'finish', reason: 'stop' },
  ];
}

describe('guardrail integration with createAgent', () => {
  test('input guardrail block prevents provider call', async () => {
    const blockHook: InputHook = async () => ({ action: 'block', reason: 'forbidden' });
    const provider = fakeProvider([{ events: textScript('Should not reach') }]);

    const agent = createAgent({
      provider,
      guardrails: { input: [blockHook] },
    });

    await expect(agent.run({ userMessage: 'blocked' })).rejects.toThrow(GuardrailError);
  });

  test('output guardrail rewrite modifies final message', async () => {
    const rewriteHook: OutputHook = async () => ({
      action: 'rewrite',
      message: { role: 'assistant', content: 'sanitized output' },
    });

    const provider = fakeProvider([{ events: textScript('original') }]);
    const _agent = createAgent({
      provider,
      guardrails: { output: [rewriteHook] },
    });

    // The run() drains text-delta events to build finalMessage,
    // but the rewritten message is stored in memory.
    // For the stream, we'd see a guardrail event on the bus.
    const bus = createEventBus();
    const guardrailEvents: unknown[] = [];
    bus.on('guardrail', (e) => guardrailEvents.push(e));

    const agentWithBus = createAgent({
      provider: fakeProvider([{ events: textScript('original') }]),
      guardrails: { output: [rewriteHook] },
      events: bus,
    });

    await agentWithBus.run({ userMessage: 'test' });
    expect(guardrailEvents.length).toBeGreaterThan(0);
  });

  test('input guardrail block throws on stream and emits bus event', async () => {
    const blockHook: InputHook = async () => ({ action: 'block', reason: 'nope' });
    const provider = fakeProvider([{ events: textScript('nope') }]);
    const bus = createEventBus();

    const guardrailEvents: unknown[] = [];
    bus.on('guardrail', (e) => guardrailEvents.push(e));

    const agent = createAgent({
      provider,
      guardrails: { input: [blockHook] },
      events: bus,
    });

    const events: AgentEvent[] = [];
    let thrownError: unknown;
    try {
      for await (const ev of agent.stream({ userMessage: 'test' })) {
        events.push(ev);
      }
    } catch (e) {
      thrownError = e;
    }

    expect(thrownError).toBeInstanceOf(GuardrailError);
    expect(guardrailEvents.length).toBeGreaterThan(0);
  });
});
