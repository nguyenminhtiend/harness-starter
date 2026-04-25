import type { CapabilityDefinition } from '@harness/core';
import { resolveModel } from '@harness/core';
import type { IMastraLogger } from '@mastra/core/logger';
import { createSimpleChatAgent } from '../../agents/index.ts';
import { agentAdapter } from '../adapters/index.ts';
import { SimpleChatInput, SimpleChatOutput } from './input.ts';
import { SimpleChatSettings } from './settings.ts';

type AgentModel = Parameters<typeof createSimpleChatAgent>[0]['model'];

export function createSimpleChatCapability(
  _logger: IMastraLogger,
): CapabilityDefinition<SimpleChatInput, SimpleChatOutput> {
  return {
    id: 'simple-chat',
    title: 'Simple Chat',
    description: 'A conversational assistant with calculator and time tools.',
    inputSchema: SimpleChatInput,
    outputSchema: SimpleChatOutput,
    settingsSchema: SimpleChatSettings,
    runner: agentAdapter({
      build: (settings) => {
        const s = settings as SimpleChatSettings;
        return createSimpleChatAgent({
          model: resolveModel(s.model) as AgentModel,
        });
      },
      extractPrompt: (input) => (input as SimpleChatInput).message,
      maxSteps: 5,
    }),
  };
}
