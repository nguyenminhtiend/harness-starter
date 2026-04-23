import type { Agent, Checkpointer, ConversationStore } from '@harness/agent';
import type { EventBus, Provider } from '@harness/core';
import type { UIEvent } from '@harness/session-events';
import type { Agent as MastraAgent } from '@mastra/core/agent';
import type { MastraMemory } from '@mastra/core/memory';
import type { ZodType } from 'zod';

type Infer<S extends ZodType> = S extends ZodType<infer T> ? T : never;

export interface BuildAgentArgs<S> {
  settings: S;
  provider: Provider;
  store: ConversationStore;
  checkpointer: Checkpointer;
  bus: EventBus;
  signal: AbortSignal;
  pushUIEvent?: (ev: UIEvent) => void;
}

interface ToolDefBase<S extends ZodType> {
  id: string;
  title: string;
  description: string;
  settingsSchema: S;
  defaultSettings: Infer<S>;
}

export interface HarnessToolDef<S extends ZodType = ZodType> extends ToolDefBase<S> {
  runtime?: 'harness';
  buildAgent(args: BuildAgentArgs<Infer<S>>): Agent;
}

export interface MastraAgentContext {
  memory?: MastraMemory;
}

export interface MastraToolDef<S extends ZodType = ZodType> extends ToolDefBase<S> {
  runtime: 'mastra';
  createAgent(settings: Infer<S>, ctx?: MastraAgentContext): MastraAgent;
}

export type ToolDef<S extends ZodType = ZodType> = HarnessToolDef<S> | MastraToolDef<S>;

export function isMastraToolDef(def: ToolDef): def is MastraToolDef {
  return def.runtime === 'mastra';
}
