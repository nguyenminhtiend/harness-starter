import {
  allAgents,
  allWorkflows,
  createMastraLogger,
  createMastraStorage,
  createObservability,
  resolveModel,
} from '@harness/mastra';
import { seedDatasets } from '@harness/mastra/evals';
import { Mastra } from '@mastra/core';
import type { MastraModelConfig } from '@mastra/core/llm';
import { MastraEditor } from '@mastra/editor';

const modelId = process.env.MASTRA_MODEL ?? 'ollama:qwen2.5:3b';
// `ollama:*` IDs are this repo's local-provider format and need our factory.
// Anything else (e.g. `openai/gpt-4o`) is passed through to Mastra's gateway.
const model = (
  modelId.startsWith('ollama:') ? resolveModel(modelId) : modelId
) as MastraModelConfig;

export const mastra = new Mastra({
  agents: allAgents({ model }),
  workflows: allWorkflows({ model }),
  storage: createMastraStorage(),
  logger: createMastraLogger(),
  observability: createObservability({ serviceName: 'harness-studio' }),
  editor: new MastraEditor(),
});

seedDatasets(mastra).catch((err: unknown) => {
  console.error('[studio] dataset seeding failed:', err);
});
