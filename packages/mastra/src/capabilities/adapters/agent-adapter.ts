import type { CapabilityRunner, RuntimeStreamChunk } from '@harness/core';
import { mapStreamChunk } from '@harness/core';
import type { Agent } from '@mastra/core/agent';

export interface AgentAdapterConfig {
  readonly build: (settings: unknown) => Agent;
  readonly extractPrompt: (input: unknown) => string;
  readonly maxSteps?: number;
}

export function agentAdapter(config: AgentAdapterConfig): CapabilityRunner {
  return async function* (_input, ctx) {
    const agent = config.build(ctx.settings);
    const prompt = config.extractPrompt(_input);

    const memoryOpt = ctx.memory
      ? { memory: { thread: ctx.memory.conversationId, resource: 'harness' } }
      : {};

    const output = await agent.stream(prompt, {
      ...memoryOpt,
      abortSignal: ctx.signal,
      maxSteps: config.maxSteps ?? 5,
    });

    const raw = output as unknown as Record<string, unknown>;
    if (!raw || typeof raw !== 'object' || !('fullStream' in raw)) {
      throw new Error('agent.stream() did not return a fullStream property');
    }
    const reader = (raw.fullStream as ReadableStream).getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const event = mapStreamChunk(value as RuntimeStreamChunk);
        if (event) {
          yield event;
        }
      }
    } finally {
      reader.releaseLock();
    }
  };
}
