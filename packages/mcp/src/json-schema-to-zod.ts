import { type ZodType, z } from 'zod';

export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  description?: string;
  default?: unknown;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  [key: string]: unknown;
}

function convertProperty(schema: JsonSchema): ZodType {
  if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
    const vals = schema.enum as [string, ...string[]];
    if (vals.length === 1) {
      return z.literal(vals[0] as string);
    }
    return z.enum(vals as [string, ...string[]]);
  }

  switch (schema.type) {
    case 'string':
      return z.string();
    case 'number':
    case 'integer':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'null':
      return z.null();
    case 'array':
      if (schema.items) {
        return z.array(convertProperty(schema.items));
      }
      return z.array(z.unknown());
    case 'object':
      return convertObject(schema);
    default:
      if (schema.properties) {
        return convertObject(schema);
      }
      return z.record(z.string(), z.unknown());
  }
}

function convertObject(schema: JsonSchema): ZodType {
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const shape: Record<string, ZodType> = {};

  for (const [key, propSchema] of Object.entries(props)) {
    const base = convertProperty(propSchema);
    shape[key] = required.has(key) ? base : base.optional();
  }

  return z.object(shape).passthrough();
}

export function jsonSchemaToZod(schema: JsonSchema): ZodType {
  if (schema.type === 'object' || schema.properties) {
    return convertObject(schema);
  }
  return z.record(z.string(), z.unknown());
}
