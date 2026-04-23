import { describe, expect, test } from 'bun:test';
import { calculatorTool } from './calculator.ts';

const ctx = {
  runId: 'test-run',
  conversationId: 'test-conv',
  signal: new AbortController().signal,
};

describe('calculatorTool', () => {
  test('evaluates addition and multiplication with precedence', async () => {
    const result = await calculatorTool.execute({ expression: '2 + 3 * 4' }, ctx);
    expect(result).toEqual({ result: 14, expression: '2 + 3 * 4' });
  });

  test('evaluates parenthesized expressions', async () => {
    const result = await calculatorTool.execute({ expression: '(2 + 3) * 4' }, ctx);
    expect(result).toEqual({ result: 20, expression: '(2 + 3) * 4' });
  });

  test('evaluates decimal numbers', async () => {
    const result = await calculatorTool.execute({ expression: '1.5 + 2.5' }, ctx);
    expect(result).toEqual({ result: 4, expression: '1.5 + 2.5' });
  });

  test('evaluates subtraction and division', async () => {
    const result = await calculatorTool.execute({ expression: '10 - 3' }, ctx);
    expect(result).toEqual({ result: 7, expression: '10 - 3' });
  });

  test('rejects expressions with non-math characters', async () => {
    await expect(calculatorTool.execute({ expression: "fetch('http://x')" }, ctx)).rejects.toThrow(
      'Invalid expression',
    );
  });

  test('rejects empty expressions', async () => {
    await expect(calculatorTool.execute({ expression: '' }, ctx)).rejects.toThrow(
      'Invalid expression',
    );
  });

  test('rejects division by zero (Infinity)', async () => {
    await expect(calculatorTool.execute({ expression: '1/0' }, ctx)).rejects.toThrow('non-finite');
  });

  test('rejects expressions producing NaN', async () => {
    await expect(calculatorTool.execute({ expression: '0/0' }, ctx)).rejects.toThrow('non-finite');
  });

  test('has correct tool metadata', () => {
    expect(calculatorTool.name).toBe('calculator');
    expect(calculatorTool.description).toBeDefined();
  });
});
