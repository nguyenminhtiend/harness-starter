import type { Tool } from '@harness/agent';
import { createAgent } from '@harness/agent';
import { z } from 'zod';
import type { ToolDef } from '../tools/types.ts';
import { calculatorTool } from './tools/calculator.ts';
import { getTimeTool } from './tools/get-time.ts';

const settingsSchema = z.object({
  model: z.string().default('openrouter/free'),
  systemPrompt: z
    .string()
    .default('You are a helpful assistant. Use tools when they would give a better answer.'),
  maxTurns: z.number().int().min(1).max(10).default(5),
});

export const simpleChatToolDef: ToolDef<typeof settingsSchema> = {
  id: 'simple-chat',
  title: 'Simple Chat',
  description:
    'Minimal multi-turn chat agent with calculator and time tools. Great for learning the agent loop.',
  settingsSchema,
  defaultSettings: settingsSchema.parse({}),
  buildAgent({ provider, settings, store, checkpointer, bus }) {
    return createAgent({
      provider,
      systemPrompt: settings.systemPrompt,
      tools: [calculatorTool as Tool, getTimeTool as Tool],
      memory: store,
      checkpointer,
      events: bus,
      maxTurns: settings.maxTurns,
    });
  },
};
