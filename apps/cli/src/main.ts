import { composeHarness } from '@harness/bootstrap';
import { startRun } from '@harness/core';
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

const message = process.argv[2];
if (!message) {
  console.error('Usage: bun run start "your message"');
  process.exit(1);
}

const modelId = process.env.MASTRA_MODEL ?? 'ollama:qwen2.5:3b';
const model = (
  modelId.startsWith('ollama:') ? resolveModel(modelId) : modelId
) as MastraModelConfig;

const mastraLogger = createMastraLogger({ level: 'error' });

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
  logLevel: 'error',
});
const controller = new AbortController();

const { runId } = await startRun(
  deps,
  { capabilityId: 'simple-chat', input: { message }, settings: {} },
  controller.signal,
);

const events = deps.eventBus.subscribe(runId);
for await (const event of events) {
  console.log(JSON.stringify(event));
  if (
    event.type === 'run.completed' ||
    event.type === 'run.failed' ||
    event.type === 'run.cancelled'
  ) {
    break;
  }
}

await shutdown();
