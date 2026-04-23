import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';

export const mastra = new Mastra({
  agents: {},
  workflows: {},
  storage: new LibSQLStore({
    url: process.env.MASTRA_DB_URL ?? 'file:./.mastra/mastra.db',
  }),
});
