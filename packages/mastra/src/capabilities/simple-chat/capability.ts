import type { CapabilityDefinition } from '@harness/core';
import type { Mastra } from '@mastra/core';
import { agentAdapter } from '../adapters/index.ts';
import { SimpleChatInput, SimpleChatOutput } from './input.ts';
import { SimpleChatSettings } from './settings.ts';

export interface SimpleChatCapabilityDeps {
  readonly mastra: Mastra;
}

export function createSimpleChatCapability(
  deps: SimpleChatCapabilityDeps,
): CapabilityDefinition<SimpleChatInput, SimpleChatOutput> {
  return {
    id: 'simple-chat',
    title: 'Simple Chat',
    description: 'A conversational assistant with calculator and time tools.',
    inputSchema: SimpleChatInput,
    outputSchema: SimpleChatOutput,
    settingsSchema: SimpleChatSettings,
    runner: agentAdapter({
      agent: deps.mastra.getAgent('simpleChatAgent'),
      extractPrompt: (input) => (input as SimpleChatInput).message,
      maxSteps: 5,
    }),
  };
}
