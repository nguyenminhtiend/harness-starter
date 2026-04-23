import { describe, expect, it } from 'bun:test';
import { tools } from '../tools/tools.registry.ts';
import { deepResearchToolDef } from './index.ts';

describe('deep-research ToolDef', () => {
  it('conforms to MastraWorkflowToolDef shape', () => {
    expect(typeof deepResearchToolDef.id).toBe('string');
    expect(deepResearchToolDef.id).toBe('deep-research');
    expect(deepResearchToolDef.runtime).toBe('mastra-workflow');
    expect(typeof deepResearchToolDef.title).toBe('string');
    expect(typeof deepResearchToolDef.description).toBe('string');
    expect(typeof deepResearchToolDef.createWorkflowConfig).toBe('function');
    const parsed = deepResearchToolDef.settingsSchema.parse(deepResearchToolDef.defaultSettings);
    expect(parsed).toEqual(deepResearchToolDef.defaultSettings);
  });

  it('is registered in the tool registry', () => {
    expect(tools['deep-research']).toBeDefined();
    expect(tools['deep-research'].id).toBe('deep-research');
  });

  it('has a valid settings schema with defaults', () => {
    const defaults = deepResearchToolDef.defaultSettings;
    expect(defaults.model).toBe('openrouter/free');
    expect(defaults.depth).toBe('medium');
    expect(defaults.budgetUsd).toBe(0.5);
    expect(defaults.maxTokens).toBe(200_000);
    expect(defaults.concurrency).toBe(3);
    expect(defaults.ephemeral).toBe(false);
    expect(defaults.hitl).toBe(true);
  });

  it('createWorkflowConfig returns expected shape', () => {
    const config = deepResearchToolDef.createWorkflowConfig(deepResearchToolDef.defaultSettings);
    expect(config.model).toBe('openrouter/free');
    expect(config.depth).toBe('medium');
    expect(config.concurrency).toBe(3);
  });
});
