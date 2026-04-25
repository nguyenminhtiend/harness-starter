import type { CapabilityDefinition } from '@harness/core';
import { resolveModel } from '@harness/core';
import { createSimpleChatAgent } from '../../agents/index.ts';
import { agentRunner } from '../runners/index.ts';
import { SimpleChatInput, SimpleChatOutput } from './input.ts';
import { SimpleChatSettings } from './settings.ts';

type AgentModel = Parameters<typeof createSimpleChatAgent>[0]['model'];

export const simpleChatCapability: CapabilityDefinition<SimpleChatInput, SimpleChatOutput> = {
  id: 'simple-chat',
  title: 'Simple Chat',
  description: 'A conversational assistant with calculator and time tools.',
  inputSchema: SimpleChatInput,
  outputSchema: SimpleChatOutput,
  settingsSchema: SimpleChatSettings,
  runner: agentRunner({
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
