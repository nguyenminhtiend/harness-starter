import type {
  Capability,
  ExecutionContext,
  RuntimeStreamChunk,
  StreamEventPayload,
} from '@harness/core';
import { mapStreamChunk } from '@harness/core';
import type { Agent } from '@mastra/core/agent';
import type { z } from 'zod';

export interface FromMastraAgentConfig<I, O> {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<I>;
  readonly outputSchema: z.ZodType<O>;
  readonly settingsSchema: z.ZodType;
  readonly createAgent: (settings: unknown) => Agent;
  readonly extractPrompt: (input: I) => string;
  readonly maxSteps?: number;
}

export function fromMastraAgent<I, O>(config: FromMastraAgentConfig<I, O>): Capability<I, O> {
  return {
    id: config.id,
    title: config.title,
    description: config.description,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,
    settingsSchema: config.settingsSchema,

    async *execute(input: I, ctx: ExecutionContext): AsyncIterable<StreamEventPayload> {
      const agent = config.createAgent(ctx.settings);
      const prompt = config.extractPrompt(input);

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
        throw new Error('Mastra agent.stream() did not return a fullStream property');
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
    },
  };
}
