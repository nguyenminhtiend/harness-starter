import type { Agent as MastraAgent } from '@mastra/core/agent';
import type { MastraMemory } from '@mastra/core/memory';
import type { ZodType } from 'zod';

type Infer<S extends ZodType> = S extends ZodType<infer T> ? T : never;

interface ToolDefBase<S extends ZodType> {
  id: string;
  title: string;
  description: string;
  settingsSchema: S;
  defaultSettings: Infer<S>;
}

export interface MastraAgentContext {
  memory?: MastraMemory;
}

export interface MastraToolDef<S extends ZodType = ZodType> extends ToolDefBase<S> {
  runtime: 'mastra';
  createAgent(settings: Infer<S>, ctx?: MastraAgentContext): MastraAgent;
}

export interface WorkflowConfig {
  model: string;
  depth?: string | undefined;
  concurrency?: number | undefined;
  maxFactCheckRetries?: number | undefined;
  plannerPrompt?: string | undefined;
  writerPrompt?: string | undefined;
  factCheckerPrompt?: string | undefined;
}

export interface MastraWorkflowToolDef<S extends ZodType = ZodType> extends ToolDefBase<S> {
  runtime: 'mastra-workflow';
  createWorkflowConfig(settings: Infer<S>): WorkflowConfig;
}

export type ToolDef<S extends ZodType = ZodType> = MastraToolDef<S> | MastraWorkflowToolDef<S>;

export function isMastraToolDef(def: ToolDef): def is MastraToolDef {
  return def.runtime === 'mastra';
}

export function isMastraWorkflowToolDef(def: ToolDef): def is MastraWorkflowToolDef {
  return def.runtime === 'mastra-workflow';
}
