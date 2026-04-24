import { z } from 'zod';

export const SimpleChatSettings = z.object({
  model: z.string().min(1),
  systemPrompt: z.string().optional(),
  maxTurns: z.number().int().positive().optional(),
});

export type SimpleChatSettings = z.infer<typeof SimpleChatSettings>;
