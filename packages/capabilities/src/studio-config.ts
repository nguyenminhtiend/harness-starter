import { createSimpleChatAgent } from '@harness/agents';
import { createDeepResearchWorkflow } from '@harness/workflows';

export interface BuildStudioConfigOptions {
  model: string;
}

export function buildStudioConfig(opts: BuildStudioConfigOptions) {
  const simpleChatAgent = createSimpleChatAgent({ model: opts.model });
  const deepResearch = createDeepResearchWorkflow({ model: opts.model });

  return {
    agents: { simpleChatAgent },
    workflows: { deepResearch },
  };
}
