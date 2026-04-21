import type { LanguageModelV2, LanguageModelV3 } from '@ai-sdk/provider';
import { generateObject, generateText, streamText } from 'ai';
import { ProviderError } from '../errors.ts';
import type {
  FinishReason,
  GenerateRequest,
  GenerateResult,
  Message,
  MessagePart,
  Provider,
  ProviderCapabilities,
  ProviderOpts,
  StreamEvent,
  Usage,
} from './types.ts';

const DEFAULT_CAPS: ProviderCapabilities = {
  caching: false,
  thinking: false,
  batch: false,
  structuredStream: false,
};

type CoreMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<Record<string, unknown>>;
};

function toAiSdkMessages(messages: Message[]): CoreMessage[] {
  return messages.map((m) => {
    if (typeof m.content === 'string') {
      return { role: m.role, content: m.content };
    }
    return {
      role: m.role,
      content: m.content.map((part) => {
        switch (part.type) {
          case 'text':
            return { type: 'text' as const, text: part.text };
          case 'image':
            return {
              type: 'image' as const,
              image: part.image,
              ...(part.mimeType ? { mimeType: part.mimeType } : {}),
            };
          case 'tool-call':
            return {
              type: 'tool-call' as const,
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              args: part.args,
            };
          case 'tool-result':
            return {
              type: 'tool-result' as const,
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              result: part.result,
              isError: part.isError,
            };
          default:
            return { type: 'text' as const, text: String(part) };
        }
      }),
    };
  });
}

function mapUsage(u: {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  totalTokens?: number | undefined;
  reasoningTokens?: number | undefined;
  cachedInputTokens?: number | undefined;
}): Usage {
  return {
    inputTokens: u.inputTokens ?? undefined,
    outputTokens: u.outputTokens ?? undefined,
    totalTokens: u.totalTokens ?? undefined,
    reasoningTokens: u.reasoningTokens,
    cachedInputTokens: u.cachedInputTokens,
  };
}

function classifyError(e: unknown): ProviderError {
  if (e instanceof ProviderError) {
    return e;
  }

  const err = e as {
    name?: string;
    message?: string;
    statusCode?: number;
    status?: number;
    isRetryable?: boolean;
  };

  const status = err.statusCode ?? err.status;
  const isApiError = err.name === 'AI_APICallError' || err.name === 'APICallError';

  if (isApiError || status != null) {
    const kind = classifyStatusCode(status);
    return new ProviderError(err.message ?? 'Provider API call failed', {
      kind,
      ...(status != null ? { status } : {}),
      cause: e,
      retriable:
        err.isRetryable ?? (kind === 'rate_limit' || kind === 'server' || kind === 'timeout'),
    });
  }

  if (e instanceof TypeError) {
    const msg = (e.message ?? '').toLowerCase();
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('econnrefused')) {
      return new ProviderError(e.message, { kind: 'timeout', cause: e, retriable: true });
    }
  }

  return new ProviderError(err.message ?? 'Unknown provider error', { kind: 'unknown', cause: e });
}

function classifyStatusCode(status: number | undefined): ProviderError['kind'] {
  if (status == null) {
    return 'unknown';
  }
  if (status === 429) {
    return 'rate_limit';
  }
  if (status === 408 || status === 504) {
    return 'timeout';
  }
  if (status === 401 || status === 403) {
    return 'auth';
  }
  if (status >= 400 && status < 500) {
    return 'bad_request';
  }
  if (status >= 500) {
    return 'server';
  }
  return 'unknown';
}

function parseToolCallArgs(args: unknown): unknown {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args);
    } catch {
      return args;
    }
  }
  return args;
}

export function aiSdkProvider(
  model: LanguageModelV2 | LanguageModelV3,
  opts?: ProviderOpts,
): Provider {
  const id = opts?.id ?? model.modelId;
  const capabilities: ProviderCapabilities = { ...DEFAULT_CAPS, ...opts?.capabilities };

  async function generate(req: GenerateRequest, signal?: AbortSignal): Promise<GenerateResult> {
    try {
      if (req.responseFormat) {
        return await generateStructured(req, signal);
      }

      const params: Record<string, unknown> = {
        model: model as never,
        messages: toAiSdkMessages(req.messages) as never,
        maxRetries: 0,
      };
      if (req.temperature != null) {
        params.temperature = req.temperature;
      }
      if (req.maxTokens != null) {
        params.maxOutputTokens = req.maxTokens;
      }
      if (signal != null) {
        params.abortSignal = signal;
      }

      const result = await generateText(params as never);

      const text = result.text;
      const toolCalls = result.toolCalls ?? [];
      const parts: MessagePart[] = [];

      if (toolCalls.length > 0) {
        if (text) {
          parts.push({ type: 'text', text });
        }
        for (const tc of toolCalls) {
          const call = tc as unknown as { toolCallId: string; toolName: string; args: unknown };
          parts.push({
            type: 'tool-call',
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            args: call.args,
          });
        }
      }

      const message: Message =
        parts.length > 0
          ? { role: 'assistant', content: parts }
          : { role: 'assistant', content: text ?? '' };

      return {
        message,
        usage: mapUsage(result.usage),
        finishReason: result.finishReason as FinishReason,
      };
    } catch (e) {
      throw classifyError(e);
    }
  }

  async function generateStructured(
    req: GenerateRequest,
    signal?: AbortSignal,
  ): Promise<GenerateResult> {
    const params: Record<string, unknown> = {
      model: model as never,
      messages: toAiSdkMessages(req.messages) as never,
      schema: req.responseFormat,
      maxRetries: 0,
    };
    if (req.temperature != null) {
      params.temperature = req.temperature;
    }
    if (req.maxTokens != null) {
      params.maxOutputTokens = req.maxTokens;
    }
    if (signal != null) {
      params.abortSignal = signal;
    }

    const result = await generateObject(params as never);
    const obj = (result as unknown as { object: unknown }).object;

    return {
      message: { role: 'assistant', content: JSON.stringify(obj) },
      usage: mapUsage(result.usage),
      finishReason: result.finishReason as FinishReason,
    };
  }

  async function* stream(req: GenerateRequest, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
    try {
      const params: Record<string, unknown> = {
        model: model as never,
        messages: toAiSdkMessages(req.messages) as never,
        maxRetries: 0,
      };
      if (req.temperature != null) {
        params.temperature = req.temperature;
      }
      if (req.maxTokens != null) {
        params.maxOutputTokens = req.maxTokens;
      }
      if (signal != null) {
        params.abortSignal = signal;
      }

      const result = streamText(params as never);

      for await (const chunk of result.fullStream) {
        const c = chunk as unknown as Record<string, unknown>;
        switch (c.type) {
          case 'text-delta':
            yield { type: 'text-delta', delta: (c.text as string | undefined) ?? '' };
            break;
          case 'reasoning-delta':
            yield {
              type: 'thinking-delta',
              delta: (c.text as string | undefined) ?? '',
            };
            break;
          case 'tool-call':
            yield {
              type: 'tool-call',
              id: (c.toolCallId as string | undefined) ?? '',
              name: (c.toolName as string | undefined) ?? '',
              args: parseToolCallArgs(c.args),
            };
            break;
          case 'finish-step': {
            const usage = c.usage as Usage | undefined;
            if (usage) {
              yield { type: 'usage', tokens: mapUsage(usage) };
            }
            break;
          }
          case 'finish':
            yield {
              type: 'finish',
              reason: ((c.finishReason as string | undefined) ?? 'unknown') as FinishReason,
            };
            break;
        }
      }
    } catch (e) {
      throw classifyError(e);
    }
  }

  return { id, capabilities, generate, stream };
}
