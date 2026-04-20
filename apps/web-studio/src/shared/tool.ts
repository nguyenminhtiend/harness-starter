import type { Agent, Checkpointer, ConversationStore } from '@harness/agent';
import type { EventBus, Provider } from '@harness/core';
import type { ZodType } from 'zod';

type Infer<S extends ZodType> = S extends ZodType<infer T> ? T : never;

export interface BuildAgentArgs<S> {
  settings: S;
  provider: Provider;
  store: ConversationStore;
  checkpointer: Checkpointer;
  bus: EventBus;
  signal: AbortSignal;
}

export interface ToolDef<S extends ZodType = ZodType> {
  id: string;
  title: string;
  description: string;
  settingsSchema: S;
  defaultSettings: Infer<S>;
  buildAgent(args: BuildAgentArgs<Infer<S>>): Agent;
}
