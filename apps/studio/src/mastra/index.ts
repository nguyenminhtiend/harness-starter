import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDeepResearchWorkflow, createSimpleChatAgent } from '@harness/mastra';
import { Mastra } from '@mastra/core';
import { MastraEditor } from '@mastra/editor';
import { LibSQLStore } from '@mastra/libsql';
import { PinoLogger } from '@mastra/loggers';

const model = process.env.MASTRA_MODEL ?? 'openai/gpt-4o';

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
