import { tool } from '@harness/agent';
import { z } from 'zod';

const SAFE_MATH_EXPR = /^[0-9+\-*/().\s]+$/;

export const calculatorTool = tool({
  name: 'calculator',
  description:
    'Evaluate a mathematical expression. Supports +, -, *, /, parentheses, and decimals.',
  parameters: z.object({
    expression: z.string().describe('The mathematical expression to evaluate, e.g. "2 + 3 * 4"'),
  }),
  async execute({ expression }) {
    const trimmed = expression.trim();
    if (!trimmed || !SAFE_MATH_EXPR.test(trimmed)) {
      throw new Error(`Invalid expression: only numbers and +, -, *, /, (, ) are allowed`);
    }

    const fn = new Function(`"use strict"; return (${trimmed});`);
    const result: unknown = fn();

    if (typeof result !== 'number' || !Number.isFinite(result)) {
      throw new Error(`Result is non-finite (got ${String(result)})`);
    }

    return { result, expression: trimmed };
  },
});
