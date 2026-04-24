import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import type { CapabilityDefinition } from '../domain/capability.ts';
import { NotFoundError } from '../domain/errors.ts';
import { getCapability } from './get-capability.ts';
import { listCapabilities } from './list-capabilities.ts';

function createTestCapability(id: string): CapabilityDefinition {
  return {
    id,
    title: id,
    description: `Test capability: ${id}`,
    inputSchema: z.object({ message: z.string() }),
    outputSchema: z.unknown(),
    settingsSchema: z.object({}),
    runner: {
      kind: 'agent',
      build: () =>
        ({
          stream: async () => ({
            fullStream: new ReadableStream({
              start(controller) {
                controller.enqueue({ type: 'text-delta', payload: { text: 'hi' } });
                controller.close();
              },
            }),
          }),
        }) as never,
      extractPrompt: () => 'test',
    },
  };
}

function createRegistry(caps: CapabilityDefinition[]) {
  return {
    list: () => caps,
    get: (id: string) => caps.find((c) => c.id === id),
  };
}

describe('listCapabilities', () => {
  it('returns all registered capabilities', () => {
    const caps = [createTestCapability('a'), createTestCapability('b')];
    const result = listCapabilities({ capabilityRegistry: createRegistry(caps) });
    expect(result.map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('getCapability', () => {
  it('returns capability by id', () => {
    const cap = createTestCapability('test');
    const result = getCapability({ capabilityRegistry: createRegistry([cap]) }, 'test');
    expect(result.id).toBe('test');
  });

  it('throws NotFoundError for unknown id', () => {
    expect(() => getCapability({ capabilityRegistry: createRegistry([]) }, 'x')).toThrow(
      NotFoundError,
    );
  });
});
