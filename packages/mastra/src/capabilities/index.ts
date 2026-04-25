export type { AgentAdapterConfig, WorkflowAdapterConfig } from './adapters/index.ts';
export { agentAdapter, workflowAdapter } from './adapters/index.ts';
export { deepResearchCapability } from './deep-research/capability.ts';
export type { DeepResearchInput } from './deep-research/input.ts';
export {
  DeepResearchInput as DeepResearchInputSchema,
  DeepResearchOutput as DeepResearchOutputSchema,
} from './deep-research/input.ts';
export type { DeepResearchSettings } from './deep-research/settings.ts';
export { DeepResearchSettings as DeepResearchSettingsSchema } from './deep-research/settings.ts';
export { createCapabilityRegistry } from './registry.ts';
export { simpleChatCapability } from './simple-chat/capability.ts';
export type { SimpleChatInput } from './simple-chat/input.ts';
export {
  SimpleChatInput as SimpleChatInputSchema,
  SimpleChatOutput as SimpleChatOutputSchema,
} from './simple-chat/input.ts';
export type { SimpleChatSettings } from './simple-chat/settings.ts';
export { SimpleChatSettings as SimpleChatSettingsSchema } from './simple-chat/settings.ts';
