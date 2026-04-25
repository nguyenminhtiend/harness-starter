import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';

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

const MOCK_USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};

function buildGenerateResult(response: ScriptedResponse) {
  if (response.type === 'text') {
    return {
      content: [{ type: 'text' as const, text: response.text }],
      finishReason: { unified: 'stop' as const, raw: undefined },
      usage: MOCK_USAGE,
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
    usage: MOCK_USAGE,
    warnings: [],
  };
}

function buildStreamChunks(response: ScriptedResponse): Record<string, unknown>[] {
  if (response.type === 'text') {
    return [
      { type: 'text-delta', id: '0', delta: response.text },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 10 },
      },
    ];
  }
  return [
    {
      type: 'tool-call',
      toolCallId: response.toolCallId,
      toolName: response.toolName,
      args: response.args,
    },
    {
      type: 'finish',
      finishReason: 'tool-calls',
      usage: { inputTokens: 10, outputTokens: 10 },
    },
  ];
}

/**
 * Create a mock model that replays scripted responses in order.
 * Supports both `doGenerate` and `doStream` for testing agents
 * via `agent.generate()` and `agent.stream()`.
 */
export function mockModel(responses: ScriptedResponse[]) {
  let genIdx = 0;
  let streamIdx = 0;

  return new MockLanguageModelV3({
    doGenerate: async () => {
      const response = responses[genIdx];
      if (!response) {
        throw new Error(`mockModel: no scripted response at index ${genIdx}`);
      }
      genIdx++;
      return buildGenerateResult(response);
    },
    doStream: async () => {
      const response = responses[streamIdx];
      if (!response) {
        throw new Error(`mockModel: no scripted stream response at index ${streamIdx}`);
      }
      streamIdx++;
      const chunks = buildStreamChunks(response);
      return {
        stream: convertArrayToReadableStream(chunks as never[]),
        rawSettings: {},
      };
    },
  });
}
