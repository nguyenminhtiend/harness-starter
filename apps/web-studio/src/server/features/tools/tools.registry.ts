import type { ToolDef } from '../../../shared/tool.ts';
import { deepResearchToolDef } from './deep-research/index.ts';

export const tools: Record<string, ToolDef> = {
  [deepResearchToolDef.id]: deepResearchToolDef,
};
