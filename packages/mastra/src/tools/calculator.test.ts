import { describe, expect, test } from 'bun:test';
import { calculatorTool } from './calculator.ts';

describe('calculatorTool', () => {
  test('has correct id and description', () => {
    expect(calculatorTool.id).toBe('calculator');
    expect(calculatorTool.description).toBeDefined();
  });

  test('evaluates addition and multiplication with precedence', async () => {
    const result = await calculatorTool.execute({ expression: '2 + 3 * 4' }, {});
    expect(result).toEqual({ value: 14 });
  });

  test('evaluates parenthesized expressions', async () => {
    const result = await calculatorTool.execute({ expression: '(2 + 3) * 4' }, {});
    expect(result).toEqual({ value: 20 });
  });

  test('evaluates decimal numbers', async () => {
    const result = await calculatorTool.execute({ expression: '1.5 + 2.5' }, {});
    expect(result).toEqual({ value: 4 });
  });

  test('evaluates subtraction and division', async () => {
    const result = await calculatorTool.execute({ expression: '10 - 3' }, {});
    expect(result).toEqual({ value: 7 });
  });

  test('rejects expressions with non-math characters', async () => {
    await expect(calculatorTool.execute({ expression: "fetch('http://x')" }, {})).rejects.toThrow(
      'Invalid expression',
    );
  });

  test('rejects empty expressions via schema validation', async () => {
    const result = await calculatorTool.execute({ expression: '' }, {});
    expect(result).toHaveProperty('error', true);
  });

  test('rejects division by zero (Infinity)', async () => {
    await expect(calculatorTool.execute({ expression: '1/0' }, {})).rejects.toThrow('non-finite');
  });

  test('rejects expressions producing NaN', async () => {
    await expect(calculatorTool.execute({ expression: '0/0' }, {})).rejects.toThrow('non-finite');
  });
});
