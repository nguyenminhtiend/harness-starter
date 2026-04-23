import { MockLanguageModelV3 } from 'ai/test';

interface TextResponse {
  type: 'text';
  text: string;
}

interface ToolCallResponse {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export type ScriptedResponse = TextResponse | ToolCallResponse;

/**
 * Create a mock model that replays scripted responses in order.
 * Each call to `doGenerate` pops the next response from the queue.
 * Use in tests to drive an Agent without live API calls.
 */
export function mockModel(responses: ScriptedResponse[]) {
  let idx = 0;

  return new MockLanguageModelV3({
    doGenerate: async () => {
      const response = responses[idx];
      if (!response) {
        throw new Error(`mockModel: no scripted response at index ${idx}`);
      }
      idx++;

      if (response.type === 'text') {
        return {
          content: [{ type: 'text' as const, text: response.text }],
          finishReason: { unified: 'stop' as const, raw: undefined },
          usage: {
            inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 10, text: 10, reasoning: undefined },
          },
          warnings: [],
        };
      }

      return {
        content: [
          {
            type: 'tool-call' as const,
            toolCallId: response.toolCallId,
            toolName: response.toolName,
            input: JSON.stringify(response.args),
          },
        ],
        finishReason: { unified: 'tool-calls' as const, raw: undefined },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 10, text: 10, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
}
