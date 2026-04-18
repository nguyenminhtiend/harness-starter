import { describe, expect, test } from 'bun:test';
import { jsonSchemaToZod } from './json-schema-to-zod.ts';

describe('jsonSchemaToZod', () => {
  test('converts empty object schema', () => {
    const schema = jsonSchemaToZod({ type: 'object', properties: {} });
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse('not-object').success).toBe(false);
  });

  test('converts object with string and number properties', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The name' },
        age: { type: 'number' },
      },
      required: ['name'],
    });
    expect(schema.safeParse({ name: 'Alice', age: 30 }).success).toBe(true);
    expect(schema.safeParse({ name: 'Alice' }).success).toBe(true);
    expect(schema.safeParse({ age: 30 }).success).toBe(false);
  });

  test('converts boolean and integer types', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        flag: { type: 'boolean' },
        count: { type: 'integer' },
      },
    });
    expect(schema.safeParse({ flag: true, count: 5 }).success).toBe(true);
  });

  test('converts string enum', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        color: { type: 'string', enum: ['red', 'green', 'blue'] },
      },
      required: ['color'],
    });
    expect(schema.safeParse({ color: 'red' }).success).toBe(true);
    expect(schema.safeParse({ color: 'purple' }).success).toBe(false);
  });

  test('converts array of strings', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string' } },
      },
    });
    expect(schema.safeParse({ tags: ['a', 'b'] }).success).toBe(true);
  });

  test('converts nested object', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        address: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      },
      required: ['address'],
    });
    expect(schema.safeParse({ address: { city: 'NYC' } }).success).toBe(true);
    expect(schema.safeParse({ address: {} }).success).toBe(false);
  });

  test('converts oneOf to z.union', () => {
    const schema = jsonSchemaToZod({ oneOf: [{ type: 'string' }, { type: 'number' }] });
    expect(schema.safeParse('hello').success).toBe(true);
    expect(schema.safeParse(42).success).toBe(true);
    expect(schema.safeParse({ anything: 'goes' }).success).toBe(false);
  });

  test('handles missing type with properties as object', () => {
    const schema = jsonSchemaToZod({
      properties: { q: { type: 'string' } },
      required: ['q'],
    });
    expect(schema.safeParse({ q: 'hi' }).success).toBe(true);
  });

  test('passthrough allows extra properties', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: { a: { type: 'string' } },
      required: ['a'],
    });
    const result = schema.safeParse({ a: 'x', b: 'extra' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).b).toBe('extra');
    }
  });
});
