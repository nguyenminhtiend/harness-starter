import { composeHarness } from '@harness/bootstrap';
import { createHttpApp } from '@harness/http';
import {
  createDeepResearchWorkflow,
  createMastraLogger,
  createMastraStorage,
  createSimpleChatAgent,
  resolveModel,
} from '@harness/mastra';
import {
  createCapabilityRegistry,
  createDeepResearchCapability,
  createSimpleChatCapability,
} from '@harness/mastra/capabilities';
import { Mastra } from '@mastra/core';
import type { MastraModelConfig } from '@mastra/core/llm';
import type { Hono } from 'hono';
import type { Config } from './config.ts';

export interface ComposedApp {
  readonly app: Hono;
  readonly shutdown: () => Promise<void>;
}

function buildModel(): MastraModelConfig {
  const id = process.env.MASTRA_MODEL ?? 'ollama:qwen2.5:3b';
  return (id.startsWith('ollama:') ? resolveModel(id) : id) as MastraModelConfig;
}

export function compose(config: Config): ComposedApp {
  const model = buildModel();
  const mastraLogger = createMastraLogger({ level: config.logLevel });

  const mastra = new Mastra({
    agents: { simpleChatAgent: createSimpleChatAgent({ model }) },
    workflows: { deepResearch: createDeepResearchWorkflow({ model }) },
    storage: createMastraStorage(),
    logger: mastraLogger,
  });

  const capabilityRegistry = createCapabilityRegistry([
    createSimpleChatCapability({ mastra }),
    createDeepResearchCapability({ mastra }),
  ]);

  const { deps, shutdown } = composeHarness({
    capabilityRegistry,
    mastraLogger,
    logLevel: config.logLevel,
  });
  return { app: createHttpApp(deps), shutdown };
}
