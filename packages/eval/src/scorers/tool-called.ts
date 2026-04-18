import { createScorer } from '../create-scorer.ts';

export interface ToolCallRecord {
  toolCalls?: Array<{ name: string; args?: unknown }>;
  events?: Array<{ type: string; name?: string; args?: unknown }>;
}

export function toolCalled(toolName: string, expectedArgs?: Record<string, unknown>) {
  return createScorer<unknown, ToolCallRecord, unknown>({
    name: 'toolCalled',
    description: `Returns 1 if tool "${toolName}" was called during the run.`,
    scorer: ({ output }) => {
      const calls: Array<{ name: string; args?: unknown }> = [];

      if (output.toolCalls) {
        calls.push(...output.toolCalls);
      }

      if (output.events) {
        for (const event of output.events) {
          if (
            (event.type === 'tool-start' || event.type === 'tool-call') &&
            event.name !== undefined
          ) {
            calls.push({ name: event.name, args: event.args });
          }
        }
      }

      const match = calls.find((c) => c.name === toolName);
      if (!match) {
        return { score: 0, metadata: { found: calls.map((c) => c.name) } };
      }

      if (expectedArgs) {
        const argsMatch = Object.entries(expectedArgs).every(
          ([k, v]) =>
            match.args != null &&
            typeof match.args === 'object' &&
            (match.args as Record<string, unknown>)[k] === v,
        );
        return {
          score: argsMatch ? 1 : 0,
          metadata: { found: match.name, actualArgs: match.args, expectedArgs },
        };
      }

      return { score: 1, metadata: { found: match.name } };
    },
  });
}
