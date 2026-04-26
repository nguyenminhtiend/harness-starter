import { describe, expect, it } from 'bun:test';
import type { StreamEventPayload } from '@harness/core';
import { agentAdapter } from './agent-adapter.ts';
import { fakeCtx } from './testing.ts';

describe('agentAdapter', () => {
  it('yields mapped stream events from agent.stream()', async () => {
    const runner = agentAdapter({
      agent: {
        stream: async () => ({
          fullStream: new ReadableStream({
            start(c) {
              c.enqueue({ type: 'text-delta', payload: { text: 'hi' } });
              c.enqueue({ type: 'step-finish', payload: { output: {} } });
              c.close();
            },
          }),
        }),
      } as never,
      extractPrompt: (input) => (input as { message: string }).message,
      maxSteps: 3,
    });

    const events: StreamEventPayload[] = [];
    for await (const e of runner({ message: 'hello' }, fakeCtx())) {
      events.push(e);
    }

    expect(events).toEqual([{ type: 'text.delta', text: 'hi' }, { type: 'step.finished' }]);
  });

  it('passes memory thread to agent when ctx.memory is set', async () => {
    let receivedOpts: Record<string, unknown> = {};
    const runner = agentAdapter({
      agent: {
        stream: async (_p: string, opts: Record<string, unknown>) => {
          receivedOpts = opts;
          return {
            fullStream: new ReadableStream({
              start(c) {
                c.close();
              },
            }),
          };
        },
      } as never,
      extractPrompt: () => 'test',
    });

    const ctx = fakeCtx({ memory: { conversationId: 'conv-42' } });
    const events: StreamEventPayload[] = [];
    for await (const e of runner({}, ctx)) {
      events.push(e);
    }

    expect(receivedOpts.memory).toEqual({ thread: 'conv-42', resource: 'harness' });
  });

  it('defaults maxSteps to 5', async () => {
    let receivedMaxSteps: unknown;
    const runner = agentAdapter({
      agent: {
        stream: async (_p: string, opts: Record<string, unknown>) => {
          receivedMaxSteps = opts.maxSteps;
          return {
            fullStream: new ReadableStream({
              start(c) {
                c.close();
              },
            }),
          };
        },
      } as never,
      extractPrompt: () => 'test',
    });

    for await (const _e of runner({}, fakeCtx())) {
      // consume
    }

    expect(receivedMaxSteps).toBe(5);
  });
});
