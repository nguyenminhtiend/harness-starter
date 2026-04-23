import { createSimpleChatAgent } from '@harness/agents';
import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';

const storage = new LibSQLStore({
  url: process.env.MASTRA_DB_URL ?? 'file:./.mastra/mastra.db',
});

const simpleChatAgent = createSimpleChatAgent({
  model: 'openai/gpt-4o',
});

export const mastra = new Mastra({
  agents: { simpleChatAgent },
  workflows: {},
  storage,
});
