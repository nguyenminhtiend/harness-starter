import { fromMastraAgent } from '@harness/adapters';
import { createSimpleChatAgent } from '@harness/agents';
import type { Capability, CapabilityEvent, ExecutionContext } from '@harness/core';
import { SimpleChatInput, SimpleChatOutput } from './input.ts';
import { SimpleChatSettings } from './settings.ts';

type AgentModel = Parameters<typeof createSimpleChatAgent>[0]['model'];

function buildCapability(modelOverride?: unknown): Capability<SimpleChatInput, SimpleChatOutput> {
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
        model: (modelOverride ?? s.model) as AgentModel,
      });
    },
    extractPrompt: (input) => input.message,
    maxSteps: 5,
  });
}

const base = buildCapability();

export const simpleChatCapability: Capability<SimpleChatInput, SimpleChatOutput> & {
  __createWithModel: (model: unknown) => Capability<SimpleChatInput, SimpleChatOutput>;
} = {
  id: base.id,
  title: base.title,
  description: base.description,
  inputSchema: base.inputSchema,
  outputSchema: base.outputSchema,
  settingsSchema: base.settingsSchema,
  supportsApproval: false,

  execute(input: SimpleChatInput, ctx: ExecutionContext): AsyncIterable<CapabilityEvent> {
    return base.execute(input, ctx);
  },

  __createWithModel(model: unknown) {
    return buildCapability(model);
  },
};
