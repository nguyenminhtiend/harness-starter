import type { CapabilityDefinition } from '@harness/core';
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

export function fromMastraAgent<I, O>(
  config: FromMastraAgentConfig<I, O>,
): CapabilityDefinition<I, O> {
  return {
    id: config.id,
    title: config.title,
    description: config.description,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,
    settingsSchema: config.settingsSchema,
    runner: {
      kind: 'agent',
      build: (settings) => config.createAgent(settings),
      extractPrompt: (input) => config.extractPrompt(input as I),
      ...(config.maxSteps != null && { maxSteps: config.maxSteps }),
    },
  };
}
