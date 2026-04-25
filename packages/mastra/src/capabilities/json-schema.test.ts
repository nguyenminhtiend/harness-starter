import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { DeepResearchInput } from './deep-research/input.ts';
import { DeepResearchSettings } from './deep-research/settings.ts';
import { SimpleChatInput } from './simple-chat/input.ts';
import { SimpleChatSettings } from './simple-chat/settings.ts';

function schemaToJson(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _, ...rest } = z.toJSONSchema(schema);
  return rest;
}

describe('capability JSON schema snapshots', () => {
  test('simple-chat input schema', () => {
    expect(schemaToJson(SimpleChatInput)).toEqual({
      type: 'object',
      properties: {
        message: { type: 'string', minLength: 1 },
        conversationId: { type: 'string' },
      },
      required: ['message'],
      additionalProperties: false,
    });
  });

  test('simple-chat settings schema', () => {
    expect(schemaToJson(SimpleChatSettings)).toEqual({
      type: 'object',
      properties: {
        model: { type: 'string', minLength: 1 },
        systemPrompt: { type: 'string' },
        maxTurns: { type: 'integer', maximum: 9007199254740991, exclusiveMinimum: 0 },
      },
      required: ['model'],
      additionalProperties: false,
    });
  });

  test('deep-research input schema', () => {
    expect(schemaToJson(DeepResearchInput)).toEqual({
      type: 'object',
      properties: {
        question: { type: 'string', minLength: 1 },
      },
      required: ['question'],
      additionalProperties: false,
    });
  });

  test('deep-research settings schema', () => {
    expect(schemaToJson(DeepResearchSettings)).toEqual({
      type: 'object',
      properties: {
        model: { type: 'string', minLength: 1 },
        depth: { type: 'string' },
        maxFactCheckRetries: { type: 'integer', minimum: 0, maximum: 9007199254740991 },
        plannerPrompt: { type: 'string' },
        writerPrompt: { type: 'string' },
        factCheckerPrompt: { type: 'string' },
      },
      required: ['model'],
      additionalProperties: false,
    });
  });
});
