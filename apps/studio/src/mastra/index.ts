import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDeepResearchWorkflow, createSimpleChatAgent, resolveModel } from '@harness/mastra';
import { Mastra } from '@mastra/core';
import type { MastraModelConfig } from '@mastra/core/llm';
import { MastraEditor } from '@mastra/editor';
import { LibSQLStore } from '@mastra/libsql';
import { PinoLogger } from '@mastra/loggers';

const modelId = process.env.MASTRA_MODEL ?? 'ollama:qwen2.5:3b';
// `ollama:*` IDs are this repo's local-provider format and need our factory.
// Anything else (e.g. `openai/gpt-4o`) is passed through to Mastra's gateway.
const model = (
  modelId.startsWith('ollama:') ? resolveModel(modelId) : modelId
) as MastraModelConfig;

// At dev runtime this resolves to apps/studio/.mastra/mastra.db, so the file
// survives across `mastra dev` rebuilds (which clean .mastra/output) and is
// shared between Studio and Editor.
const defaultDbUrl = `file:${resolve(dirname(fileURLToPath(import.meta.url)), '..', 'mastra.db')}`;

const storage = new LibSQLStore({
  id: 'mastra-storage',
  url: process.env.MASTRA_DB_URL ?? defaultDbUrl,
});

const logger = new PinoLogger({
  level: 'info',
  prettyPrint: process.env.NODE_ENV !== 'production',
});

export const mastra = new Mastra({
  agents: { simpleChatAgent: createSimpleChatAgent({ model }) },
  workflows: { deepResearch: createDeepResearchWorkflow({ model }) },
  storage,
  logger,
  editor: new MastraEditor(),
});
