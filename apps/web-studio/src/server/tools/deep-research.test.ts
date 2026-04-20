import { describe, expect, it } from 'bun:test';
import { inMemoryCheckpointer, inMemoryStore } from '@harness/agent';
import { createEventBus } from '@harness/core';
import { fakeProvider } from '@harness/core/testing';
import type { ToolDef } from '../../shared/tool.ts';
import { deepResearchToolDef } from './deep-research.ts';
import { tools } from './registry.ts';

describe('deep-research ToolDef', () => {
  it('conforms to ToolDef (shape + parseable defaults)', () => {
    const def: ToolDef = deepResearchToolDef;
    expect(typeof def.id).toBe('string');
    expect(def.id.length).toBeGreaterThan(0);
    expect(typeof def.title).toBe('string');
    expect(typeof def.description).toBe('string');
    expect(typeof def.buildAgent).toBe('function');
    const parsed = def.settingsSchema.parse(def.defaultSettings);
    expect(parsed).toEqual(def.defaultSettings);
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
    expect(defaults.hitl).toBe(false);
  });

  it('buildAgent returns an object with stream and run methods', () => {
    const provider = fakeProvider([]);
    const agent = deepResearchToolDef.buildAgent({
      settings: deepResearchToolDef.defaultSettings,
      provider,
      store: inMemoryStore(),
      checkpointer: inMemoryCheckpointer(),
      bus: createEventBus(),
      signal: new AbortController().signal,
    });

    expect(typeof agent.stream).toBe('function');
    expect(typeof agent.run).toBe('function');
  });
});
