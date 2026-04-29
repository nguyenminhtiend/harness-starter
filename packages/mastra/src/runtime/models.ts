import { createOllama } from 'ollama-ai-provider-v2';

export type ChatTier =
  | 'tiny'
  | 'default'
  | 'strong'
  | 'cloud-strong'
  | 'cloud-default'
  | 'cloud-judge';

const CHAT_DEFAULTS: Record<string, string> = {
  tiny: 'ollama:qwen2.5:1.5b',
  default: 'ollama:qwen2.5:3b',
  strong: 'ollama:qwen2.5:7b',
  'cloud-strong': 'claude-sonnet-4-6',
};

const CHAT_ENV: Record<string, string> = {
  tiny: 'MASTRA_MODEL_TINY',
  default: 'MASTRA_MODEL',
  strong: 'MASTRA_MODEL_STRONG',
  'cloud-strong': 'MASTRA_CLOUD_STRONG_MODEL',
};

const RESERVED_TIERS = new Set(['cloud-default', 'cloud-judge']);

const JUDGE_DEFAULT = 'ollama:qwen2.5:14b';
const EMBED_DEFAULT = 'ollama:nomic-embed-text';

function resolveOllama(modelId: string) {
  const parts = modelId.split(':');
  parts.shift();
  const model = parts.join(':');
  const baseURL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/api';
  return createOllama({ baseURL })(model);
}

function resolveCloudModel(modelId: string) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      `Cloud model "${modelId}" requires ANTHROPIC_API_KEY to be set. ` +
        'Set the env var or use a local tier instead.',
    );
  }
  // Lazy-load @ai-sdk/anthropic to avoid requiring cloud creds for local-only runs
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { anthropic } = require('@ai-sdk/anthropic');
  return anthropic(modelId);
}

function resolveModelId(modelId: string): unknown {
  if (modelId.startsWith('ollama:')) {
    return resolveOllama(modelId);
  }
  return resolveCloudModel(modelId);
}

export function getChatModel(tier: ChatTier): unknown {
  if (RESERVED_TIERS.has(tier)) {
    throw new Error(`Tier "${tier}" is not yet wired. Reserved for future use.`);
  }

  const envKey = CHAT_ENV[tier];
  const modelId = (envKey ? process.env[envKey] : undefined) ?? CHAT_DEFAULTS[tier];
  if (!modelId) {
    throw new Error(`No default model configured for tier "${tier}"`);
  }

  return resolveModelId(modelId);
}

export function getJudgeModel(): unknown {
  const modelId = process.env.MASTRA_JUDGE_MODEL ?? JUDGE_DEFAULT;
  return resolveModelId(modelId);
}

export function getEmbedder(): unknown {
  const modelId = process.env.MASTRA_EMBEDDER ?? EMBED_DEFAULT;
  if (modelId.startsWith('ollama:')) {
    const parts = modelId.split(':');
    parts.shift();
    const model = parts.join(':');
    const baseURL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/api';
    return createOllama({ baseURL }).embedding(model);
  }
  throw new Error(`Unsupported embedder provider in "${modelId}". Currently supported: ollama.`);
}
