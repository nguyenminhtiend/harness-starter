import { z } from 'zod';

export const SimpleChatInput = z.object({
  message: z.string().min(1),
  conversationId: z.string().optional(),
});

export type SimpleChatInput = z.infer<typeof SimpleChatInput>;

export const SimpleChatOutput = z.object({
  text: z.string(),
});

export type SimpleChatOutput = z.infer<typeof SimpleChatOutput>;
