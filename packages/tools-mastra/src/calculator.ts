import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const SAFE_MATH_EXPR = /^[0-9+\-*/().\s]+$/;

export const calculatorTool = createTool({
  id: 'calculator',
  description: 'Evaluate a simple arithmetic expression. Supports + - * / ( ) and decimals.',
  inputSchema: z.object({
    expression: z.string().min(1).max(200),
  }),
  outputSchema: z.object({ value: z.number() }),
  execute: async (inputData) => {
    const trimmed = inputData.expression.trim();
    if (!trimmed || !SAFE_MATH_EXPR.test(trimmed)) {
      throw new Error('Invalid expression: only numbers and +, -, *, /, (, ) are allowed');
    }

    const fn = new Function(`"use strict"; return (${trimmed});`);
    const result: unknown = fn();

    if (typeof result !== 'number' || !Number.isFinite(result)) {
      throw new Error(`Result is non-finite (got ${String(result)})`);
    }

    return { value: result };
  },
});
