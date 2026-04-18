import type { ZodType } from 'zod';

// --- Usage & Finish ---

export interface Usage {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;
  reasoningTokens?: number | undefined;
  cachedInputTokens?: number | undefined;
}

export type FinishReason =
  | 'stop'
  | 'length'
  | 'tool-calls'
  | 'content-filter'
  | 'error'
  | 'other'
  | 'unknown';

// --- Messages ---

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type TextPart = { type: 'text'; text: string };
export type ImagePart = { type: 'image'; image: string | Uint8Array; mimeType?: string };
export type ToolCallPart = {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: unknown;
};
export type ToolResultPart = {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
};

export type MessagePart = TextPart | ImagePart | ToolCallPart | ToolResultPart;

export interface Message {
  role: MessageRole;
  content: string | MessagePart[];
  cacheBoundary?: boolean;
}

// --- Tool Schema ---

export interface ToolSchema {
  name: string;
  description: string;
  parameters: ZodType;
}

// --- Requests ---

export interface GenerateRequest {
  messages: Message[];
  tools?: ToolSchema[];
  toolChoice?: 'auto' | 'none' | 'required' | { name: string };
  temperature?: number;
  maxTokens?: number;
  responseFormat?: ZodType;
  thinking?: { enabled: boolean; budgetTokens?: number };
  cache?: { autoInsert?: boolean };
}

// --- Results ---

export interface GenerateResult {
  message: Message;
  usage: Usage;
  finishReason: FinishReason;
}

export interface BatchHandle {
  results: Promise<GenerateResult[]>;
  cancel: (signal?: AbortSignal) => void;
}

// --- Stream Events ---

export type StreamEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'thinking-delta'; delta: string }
  | { type: 'structured-partial'; path: string; value: unknown }
  | { type: 'tool-call'; id: string; name: string; args: unknown }
  | {
      type: 'usage';
      tokens: Usage;
      costUSD?: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
    }
  | { type: 'finish'; reason: FinishReason };

// --- Provider ---

export interface ProviderCapabilities {
  caching: boolean;
  thinking: boolean;
  batch: boolean;
  structuredStream: boolean;
}

export interface ProviderOpts {
  id?: string;
  capabilities?: Partial<ProviderCapabilities>;
}

export interface Provider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  generate(req: GenerateRequest, signal?: AbortSignal): Promise<GenerateResult>;
  stream(req: GenerateRequest, signal?: AbortSignal): AsyncIterable<StreamEvent>;
  batch?(reqs: GenerateRequest[], signal?: AbortSignal): Promise<BatchHandle>;
}
