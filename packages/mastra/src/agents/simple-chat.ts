import { Agent } from '@mastra/core/agent';
import type { MastraScorers } from '@mastra/core/evals';
import type { MastraModelConfig } from '@mastra/core/llm';
import type { MastraMemory } from '@mastra/core/memory';
import { defaultAgentScorers } from '../evals/index.ts';
import { calculatorTool, getTimeTool } from '../tools/index.ts';

export interface SimpleChatAgentOptions {
  model: MastraModelConfig;
  memory?: MastraMemory;
  scorers?: MastraScorers;
}

export function createSimpleChatAgent(opts: SimpleChatAgentOptions) {
  return new Agent({
    id: 'simple-chat',
    name: 'Simple Chat',
    instructions:
      'You are a concise assistant. Use tools when the user asks for arithmetic or the current time. ' +
      'Never fabricate tool output.',
    model: opts.model,
    tools: { calculator: calculatorTool, get_time: getTimeTool },
    scorers: opts.scorers ?? defaultAgentScorers(opts.model),
    ...(opts.memory ? { memory: opts.memory } : {}),
  });
}
