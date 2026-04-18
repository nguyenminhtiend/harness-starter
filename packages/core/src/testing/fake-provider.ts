import type {
  GenerateRequest,
  GenerateResult,
  Message,
  MessagePart,
  Provider,
  ProviderCapabilities,
  StreamEvent,
  Usage,
} from '../provider/types.ts';

export interface ScriptedStream {
  events: StreamEvent[];
  delayMs?: number;
}

export interface FakeProviderOpts {
  id?: string;
  capabilities?: Partial<ProviderCapabilities>;
}

const DEFAULT_CAPS: ProviderCapabilities = {
  caching: false,
  thinking: false,
  batch: false,
  structuredStream: false,
};

const EMPTY_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
};

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('The operation was aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('The operation was aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

export function fakeProvider(script: ScriptedStream[], opts?: FakeProviderOpts): Provider {
  let cursor = 0;
  const id = opts?.id ?? 'fake';
  const capabilities: ProviderCapabilities = { ...DEFAULT_CAPS, ...opts?.capabilities };

  function nextScript(): ScriptedStream {
    if (cursor >= script.length) {
      throw new Error(
        `fakeProvider: script exhausted (${cursor} calls made, ${script.length} scripted)`,
      );
    }
    const entry = script[cursor++];
    if (!entry) {
      throw new Error('fakeProvider: unexpected missing script entry');
    }
    return entry;
  }

  async function* streamEvents(
    scripted: ScriptedStream,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    for (const event of scripted.events) {
      if (signal?.aborted) {
        throw new DOMException('The operation was aborted', 'AbortError');
      }
      if (scripted.delayMs) {
        await delay(scripted.delayMs, signal);
      }
      yield event;
    }
  }

  function stream(_req: GenerateRequest, signal?: AbortSignal): AsyncIterable<StreamEvent> {
    const scripted = nextScript();
    return streamEvents(scripted, signal);
  }

  async function generate(req: GenerateRequest, signal?: AbortSignal): Promise<GenerateResult> {
    const events: StreamEvent[] = [];
    for await (const e of stream(req, signal)) {
      events.push(e);
    }

    let text = '';
    const parts: MessagePart[] = [];
    let usage: Usage = { ...EMPTY_USAGE };
    let finishReason: GenerateResult['finishReason'] = 'stop';

    for (const e of events) {
      switch (e.type) {
        case 'text-delta':
          text += e.delta;
          break;
        case 'tool-call':
          parts.push({ type: 'tool-call', toolCallId: e.id, toolName: e.name, args: e.args });
          break;
        case 'usage':
          usage = e.tokens;
          break;
        case 'finish':
          finishReason = e.reason;
          break;
      }
    }

    const message: Message =
      parts.length > 0
        ? { role: 'assistant', content: text ? [{ type: 'text', text }, ...parts] : parts }
        : { role: 'assistant', content: text };

    return { message, usage, finishReason };
  }

  return { id, capabilities, generate, stream };
}
