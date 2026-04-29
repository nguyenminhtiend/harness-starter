import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type ChatTier, getChatModel, getEmbedder, getJudgeModel } from './models.ts';

const ENV_KEYS = [
  'MASTRA_MODEL_TINY',
  'MASTRA_MODEL',
  'MASTRA_MODEL_STRONG',
  'MASTRA_CLOUD_STRONG_MODEL',
  'MASTRA_JUDGE_MODEL',
  'MASTRA_EMBEDDER',
  'ANTHROPIC_API_KEY',
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
});

describe('getChatModel', () => {
  it('returns a model for tiny tier', () => {
    const model = getChatModel('tiny');
    expect(model).toBeDefined();
    expect(typeof model).toBe('object');
  });

  it('returns a model for default tier', () => {
    const model = getChatModel('default');
    expect(model).toBeDefined();
  });

  it('returns a model for strong tier', () => {
    const model = getChatModel('strong');
    expect(model).toBeDefined();
  });

  it('respects MASTRA_MODEL_TINY env override', () => {
    process.env.MASTRA_MODEL_TINY = 'ollama:qwen2.5:0.5b';
    const model = getChatModel('tiny');
    expect(model).toBeDefined();
  });

  it('respects MASTRA_MODEL env override for default tier', () => {
    process.env.MASTRA_MODEL = 'ollama:qwen2.5:7b';
    const model = getChatModel('default');
    expect(model).toBeDefined();
  });

  it('respects MASTRA_MODEL_STRONG env override', () => {
    process.env.MASTRA_MODEL_STRONG = 'ollama:qwen2.5:14b';
    const model = getChatModel('strong');
    expect(model).toBeDefined();
  });

  it('throws for cloud-strong when ANTHROPIC_API_KEY is unset', () => {
    expect(() => getChatModel('cloud-strong')).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('throws for reserved cloud tiers', () => {
    expect(() => getChatModel('cloud-default' as ChatTier)).toThrow(/not yet wired/);
    expect(() => getChatModel('cloud-judge' as ChatTier)).toThrow(/not yet wired/);
  });
});

describe('getJudgeModel', () => {
  it('returns a model', () => {
    const model = getJudgeModel();
    expect(model).toBeDefined();
  });

  it('respects MASTRA_JUDGE_MODEL env override', () => {
    process.env.MASTRA_JUDGE_MODEL = 'ollama:qwen2.5:7b';
    const model = getJudgeModel();
    expect(model).toBeDefined();
  });
});

describe('getEmbedder', () => {
  it('returns an embedder', () => {
    const embedder = getEmbedder();
    expect(embedder).toBeDefined();
  });

  it('respects MASTRA_EMBEDDER env override', () => {
    process.env.MASTRA_EMBEDDER = 'ollama:mxbai-embed-large';
    const embedder = getEmbedder();
    expect(embedder).toBeDefined();
  });
});
