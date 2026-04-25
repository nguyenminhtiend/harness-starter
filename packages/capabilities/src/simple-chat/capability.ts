import { createSimpleChatAgent } from '@harness/agents';
import type { CapabilityDefinition } from '@harness/core';
import { createLanguageModel } from '@harness/core';
import { SimpleChatInput, SimpleChatOutput } from './input.ts';
import { SimpleChatSettings } from './settings.ts';

type AgentModel = Parameters<typeof createSimpleChatAgent>[0]['model'];

function resolveModel(raw: unknown): AgentModel {
  if (typeof raw === 'string') {
    return createLanguageModel(raw) as AgentModel;
  }
  return raw as AgentModel;
}

export const simpleChatCapability: CapabilityDefinition<SimpleChatInput, SimpleChatOutput> = {
  id: 'simple-chat',
  title: 'Simple Chat',
  description: 'A conversational assistant with calculator and time tools.',
  inputSchema: SimpleChatInput,
  outputSchema: SimpleChatOutput,
  settingsSchema: SimpleChatSettings,
  runner: {
    kind: 'agent',
    build: (settings) => {
      const s = settings as SimpleChatSettings;
      return createSimpleChatAgent({
        model: resolveModel(s.model),
      });
    },
    extractPrompt: (input) => (input as SimpleChatInput).message,
    maxSteps: 5,
  },
};
