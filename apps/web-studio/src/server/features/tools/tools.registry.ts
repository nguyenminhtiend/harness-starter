import { deepResearchToolDef } from '../deep-research/index.ts';
import type { ToolDef } from './types.ts';

export const tools: Record<string, ToolDef> = {
  [deepResearchToolDef.id]: deepResearchToolDef,
};
