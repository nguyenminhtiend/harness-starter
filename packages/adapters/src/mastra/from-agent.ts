import type { Capability, CapabilityEvent, ExecutionContext } from '@harness/core';
import type { Agent } from '@mastra/core/agent';
import type { z } from 'zod';
import type { MastraStreamChunk } from './event-mapper.ts';
import { mapMastraChunk } from './event-mapper.ts';

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

    async *execute(input: I, ctx: ExecutionContext): AsyncIterable<CapabilityEvent> {
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

      const reader = (output as unknown as { fullStream: ReadableStream }).fullStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          const event = mapMastraChunk(value as MastraStreamChunk);
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
