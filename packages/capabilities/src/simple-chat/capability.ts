import { createLanguageModel, fromMastraAgent } from '@harness/adapters';
import { createSimpleChatAgent } from '@harness/agents';
import { withModelOverride } from '../with-model-override.ts';
import { SimpleChatInput, SimpleChatOutput } from './input.ts';
import { SimpleChatSettings } from './settings.ts';

type AgentModel = Parameters<typeof createSimpleChatAgent>[0]['model'];

function resolveModel(raw: unknown): AgentModel {
  if (typeof raw === 'string') {
    return createLanguageModel(raw) as AgentModel;
  }
  return raw as AgentModel;
}

function buildCapability(modelOverride?: unknown) {
  return fromMastraAgent<SimpleChatInput, SimpleChatOutput>({
    id: 'simple-chat',
    title: 'Simple Chat',
    description: 'A conversational assistant with calculator and time tools.',
    inputSchema: SimpleChatInput,
    outputSchema: SimpleChatOutput,
    settingsSchema: SimpleChatSettings,
    createAgent: (settings) => {
      const s = settings as SimpleChatSettings;
      return createSimpleChatAgent({
        model: resolveModel(modelOverride ?? s.model),
      });
    },
    extractPrompt: (input) => input.message,
    maxSteps: 5,
  });
}

export const simpleChatCapability = withModelOverride(buildCapability);
