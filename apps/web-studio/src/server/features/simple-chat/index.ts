import { createSimpleChatAgent } from '@harness/agents';
import { z } from 'zod';
import { resolveModel } from '../../infra/llm.ts';
import type { MastraToolDef } from '../tools/types.ts';

const settingsSchema = z.object({
  model: z.string().default('ollama:qwen2.5:3b'),
  systemPrompt: z
    .string()
    .default('You are a helpful assistant. Use tools when they would give a better answer.'),
  maxTurns: z.number().int().min(1).max(10).default(5),
});

export const simpleChatToolDef: MastraToolDef<typeof settingsSchema> = {
  id: 'simple-chat',
  title: 'Simple Chat',
  description:
    'Minimal multi-turn chat agent with calculator and time tools. Great for learning the agent loop.',
  settingsSchema,
  defaultSettings: settingsSchema.parse({}),
  runtime: 'mastra',
  createAgent(settings, ctx) {
    return createSimpleChatAgent({
      model: resolveModel(settings.model),
      ...(ctx?.memory ? { memory: ctx.memory } : {}),
    });
  },
};
