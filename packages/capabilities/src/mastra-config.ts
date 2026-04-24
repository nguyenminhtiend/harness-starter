import { createSimpleChatAgent } from '@harness/agents';
import { createDeepResearchWorkflow } from '@harness/workflows';

export interface BuildMastraConfigOptions {
  model: string;
}

export function buildMastraConfig(opts: BuildMastraConfigOptions) {
  const simpleChatAgent = createSimpleChatAgent({ model: opts.model });
  const deepResearch = createDeepResearchWorkflow({ model: opts.model });

  return {
    agents: { simpleChatAgent },
    workflows: { deepResearch },
  };
}
