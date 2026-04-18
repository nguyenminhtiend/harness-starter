import { z } from 'zod';
import type { Agent, SubagentSpec, Tool, ToolContext } from '../types.ts';

export function subagentAsTool(child: Agent, spec: SubagentSpec): Tool<{ input: string }, string> {
  return {
    name: spec.name,
    description: spec.description,
    parameters: z.object({ input: z.string() }),
    async execute(args: { input: string }, ctx: ToolContext): Promise<string> {
      const conversationId = crypto.randomUUID();
      const result = await child.run(
        { conversationId, userMessage: args.input },
        { signal: ctx.signal },
      );
      return typeof result.finalMessage === 'string'
        ? result.finalMessage
        : JSON.stringify(result.finalMessage);
    },
  };
}
