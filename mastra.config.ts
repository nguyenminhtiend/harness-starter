import { createDeepResearchWorkflow, createSimpleChatAgent } from '@harness/mastra';
import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { PinoLogger } from '@mastra/loggers';

const model = process.env.MASTRA_MODEL ?? 'openai/gpt-4o';

const storage = new LibSQLStore({
  id: 'mastra-storage',
  url: process.env.MASTRA_DB_URL ?? 'file:./.mastra/mastra.db',
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
});
