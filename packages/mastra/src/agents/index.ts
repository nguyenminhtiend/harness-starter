import type { MastraModelConfig } from '@mastra/core/llm';
import { createSimpleChatAgent } from './simple-chat.ts';

export type { SimpleChatAgentOptions } from './simple-chat.ts';
export { createSimpleChatAgent } from './simple-chat.ts';

export const allAgents = (opts: { model: MastraModelConfig }) => ({
  simpleChatAgent: createSimpleChatAgent(opts),
});
