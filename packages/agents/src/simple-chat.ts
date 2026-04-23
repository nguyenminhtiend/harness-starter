import { calculatorTool, getTimeTool } from '@harness/tools';
import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import type { MastraMemory } from '@mastra/core/memory';

export interface SimpleChatAgentOptions {
  model: MastraModelConfig;
  memory?: MastraMemory;
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
    ...(opts.memory ? { memory: opts.memory } : {}),
  });
}
