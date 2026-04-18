import { describe, expect, test } from 'bun:test';
import {
  BudgetExceededError,
  GuardrailError,
  HarnessError,
  LoopExhaustedError,
  ProviderError,
  ToolError,
  ValidationError,
} from './errors.ts';

describe('HarnessError', () => {
  test('is abstract — cannot be instantiated directly', () => {
    expect(() => new (HarnessError as never)('test')).toThrow();
  });
});

describe('ProviderError', () => {
  test('sets class to "provider"', () => {
    const err = new ProviderError('rate limited', { kind: 'rate_limit', status: 429 });
    expect(err.class).toBe('provider');
  });

  test('stores kind and status', () => {
    const err = new ProviderError('timeout', { kind: 'timeout', status: 408 });
    expect(err.kind).toBe('timeout');
    expect(err.status).toBe(408);
  });

  test('rate_limit and timeout and server are retriable by default', () => {
    expect(new ProviderError('', { kind: 'rate_limit' }).retriable).toBe(true);
    expect(new ProviderError('', { kind: 'timeout' }).retriable).toBe(true);
    expect(new ProviderError('', { kind: 'server' }).retriable).toBe(true);
  });

  test('auth and bad_request and unknown are not retriable by default', () => {
    expect(new ProviderError('', { kind: 'auth' }).retriable).toBe(false);
    expect(new ProviderError('', { kind: 'bad_request' }).retriable).toBe(false);
    expect(new ProviderError('', { kind: 'unknown' }).retriable).toBe(false);
  });

  test('retriable can be overridden', () => {
    const err = new ProviderError('', { kind: 'auth', retriable: true });
    expect(err.retriable).toBe(true);
  });

  test('chains cause', () => {
    const cause = new Error('original');
    const err = new ProviderError('wrapped', { kind: 'server', cause });
    expect(err.cause).toBe(cause);
  });

  test('stores context', () => {
    const err = new ProviderError('fail', { kind: 'server', context: { model: 'gpt-4o' } });
    expect(err.context).toEqual({ model: 'gpt-4o' });
  });

  test('is instanceof Error and HarnessError', () => {
    const err = new ProviderError('fail', { kind: 'server' });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(HarnessError);
    expect(err).toBeInstanceOf(ProviderError);
  });

  test('has correct name', () => {
    const err = new ProviderError('fail', { kind: 'server' });
    expect(err.name).toBe('ProviderError');
  });

  test('retryAfter is preserved when set', () => {
    const err = new ProviderError('rate limited', { kind: 'rate_limit', retryAfter: 5000 });
    expect(err.retryAfter).toBe(5000);
  });
});

describe('ToolError', () => {
  test('sets class to "tool"', () => {
    const err = new ToolError('tool failed', { toolName: 'readFile' });
    expect(err.class).toBe('tool');
  });

  test('stores toolName', () => {
    const err = new ToolError('tool failed', { toolName: 'readFile' });
    expect(err.toolName).toBe('readFile');
  });

  test('is not retriable by default', () => {
    const err = new ToolError('tool failed', { toolName: 'readFile' });
    expect(err.retriable).toBe(false);
  });

  test('is instanceof HarnessError', () => {
    const err = new ToolError('tool failed', { toolName: 'readFile' });
    expect(err).toBeInstanceOf(HarnessError);
  });
});

describe('ValidationError', () => {
  test('sets class to "validation"', () => {
    const err = new ValidationError('invalid input', { zodIssues: [{ code: 'invalid_type' }] });
    expect(err.class).toBe('validation');
  });

  test('stores zodIssues', () => {
    const issues = [{ code: 'invalid_type', message: 'Expected string' }];
    const err = new ValidationError('invalid', { zodIssues: issues });
    expect(err.zodIssues).toEqual(issues);
  });

  test('is not retriable by default', () => {
    const err = new ValidationError('invalid', { zodIssues: [] });
    expect(err.retriable).toBe(false);
  });
});

describe('GuardrailError', () => {
  test('sets class to "guardrail"', () => {
    const err = new GuardrailError('blocked', { phase: 'input' });
    expect(err.class).toBe('guardrail');
  });

  test('stores phase', () => {
    expect(new GuardrailError('blocked', { phase: 'input' }).phase).toBe('input');
    expect(new GuardrailError('blocked', { phase: 'output' }).phase).toBe('output');
  });

  test('is not retriable by default', () => {
    const err = new GuardrailError('blocked', { phase: 'input' });
    expect(err.retriable).toBe(false);
  });
});

describe('BudgetExceededError', () => {
  test('sets class to "budget"', () => {
    const err = new BudgetExceededError('over budget', { kind: 'usd', spent: 1.5, limit: 1.0 });
    expect(err.class).toBe('budget');
  });

  test('stores kind, spent, and limit', () => {
    const err = new BudgetExceededError('over budget', {
      kind: 'tokens',
      spent: 5000,
      limit: 4000,
    });
    expect(err.kind).toBe('tokens');
    expect(err.spent).toBe(5000);
    expect(err.limit).toBe(4000);
  });

  test('is not retriable', () => {
    const err = new BudgetExceededError('over budget', { kind: 'usd', spent: 1, limit: 0.5 });
    expect(err.retriable).toBe(false);
  });
});

describe('LoopExhaustedError', () => {
  test('sets class to "loop"', () => {
    const err = new LoopExhaustedError('max turns', { turns: 10 });
    expect(err.class).toBe('loop');
  });

  test('stores turns', () => {
    const err = new LoopExhaustedError('max turns', { turns: 25 });
    expect(err.turns).toBe(25);
  });

  test('is not retriable', () => {
    const err = new LoopExhaustedError('max turns', { turns: 10 });
    expect(err.retriable).toBe(false);
  });
});

describe('context bag', () => {
  test('defaults to empty object', () => {
    const err = new ProviderError('fail', { kind: 'server' });
    expect(err.context).toEqual({});
  });

  test('preserves provided context', () => {
    const ctx = { runId: 'abc', turn: 3 };
    const err = new ToolError('fail', { toolName: 'x', context: ctx });
    expect(err.context).toEqual(ctx);
  });
});

describe('JSON serialization', () => {
  test('error can be serialized to JSON for event payloads', () => {
    const err = new ProviderError('rate limited', {
      kind: 'rate_limit',
      status: 429,
      context: { model: 'gpt-4o' },
    });
    const json = JSON.parse(JSON.stringify(err.toJSON()));
    expect(json.name).toBe('ProviderError');
    expect(json.message).toBe('rate limited');
    expect(json.class).toBe('provider');
    expect(json.kind).toBe('rate_limit');
    expect(json.status).toBe(429);
    expect(json.context).toEqual({ model: 'gpt-4o' });
    expect(json.retriable).toBe(true);
  });
});
