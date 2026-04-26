import type { MastraModelConfig } from '@mastra/core/llm';
import { createDeepResearchWorkflow } from './deep-research/index.ts';

export type { DeepResearchWorkflowOptions } from './deep-research/index.ts';
export { createDeepResearchWorkflow } from './deep-research/index.ts';

export const allWorkflows = (opts: { model: MastraModelConfig }) => ({
  deepResearch: createDeepResearchWorkflow(opts),
});
export type { Finding, ResearchState } from './deep-research/schemas.ts';
export { ResearchPlan, Subquestion } from './deep-research/schemas.ts';
export type { StepLogger, StepTimer } from './lib/logged-step.ts';
export { startStepLog, wrapWithLogging } from './lib/logged-step.ts';
