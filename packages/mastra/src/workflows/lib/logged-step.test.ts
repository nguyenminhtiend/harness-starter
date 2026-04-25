import { describe, expect, it } from 'bun:test';
import { type StepLogger, startStepLog, wrapWithLogging } from './logged-step.ts';

describe('startStepLog', () => {
  it('logs step.start immediately and step.end on end()', () => {
    const entries: { obj: Record<string, unknown>; msg: string }[] = [];
    const logger: StepLogger = {
      info(obj, msg) {
        entries.push({ obj, msg });
      },
    };

    const timer = startStepLog(logger, 'my-step');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ obj: { stepId: 'my-step' }, msg: 'step.start' });

    timer.end('success');
    expect(entries).toHaveLength(2);
    expect(entries[1].obj).toMatchObject({ stepId: 'my-step', status: 'success' });
    expect(entries[1].msg).toBe('step.end');
    expect(typeof entries[1].obj.durationMs).toBe('number');
  });

  it('records error status', () => {
    const entries: { obj: Record<string, unknown>; msg: string }[] = [];
    const logger: StepLogger = {
      info(obj, msg) {
        entries.push({ obj, msg });
      },
    };

    const timer = startStepLog(logger, 'fail-step');
    timer.end('error');
    expect(entries[1].obj).toMatchObject({ stepId: 'fail-step', status: 'error' });
  });

  it('is a no-op when logger is undefined', () => {
    const timer = startStepLog(undefined, 'noop');
    timer.end('success');
  });
});

describe('wrapWithLogging', () => {
  it('logs step.start and step.end around successful execution', async () => {
    const entries: { obj: Record<string, unknown>; msg: string }[] = [];
    const logger: StepLogger = {
      info(obj, msg) {
        entries.push({ obj, msg });
      },
    };

    const wrapped = wrapWithLogging(logger, 'plan', async (ctx: { x: number }) => ({
      y: ctx.x * 2,
    }));
    const result = await wrapped({ x: 5 });

    expect(result).toEqual({ y: 10 });
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ obj: { stepId: 'plan' }, msg: 'step.start' });
    expect(entries[1].obj).toMatchObject({ stepId: 'plan', status: 'success' });
    expect(entries[1].msg).toBe('step.end');
    expect(typeof entries[1].obj.durationMs).toBe('number');
  });

  it('logs error status when execution throws', async () => {
    const entries: { obj: Record<string, unknown>; msg: string }[] = [];
    const logger: StepLogger = {
      info(obj, msg) {
        entries.push({ obj, msg });
      },
    };

    const wrapped = wrapWithLogging(logger, 'bad-step', async () => {
      throw new Error('boom');
    });

    await expect(wrapped({})).rejects.toThrow('boom');
    expect(entries).toHaveLength(2);
    expect(entries[1].obj).toMatchObject({ stepId: 'bad-step', status: 'error' });
  });

  it('returns original function when logger is undefined', async () => {
    const fn = async (x: number) => x * 2;
    const wrapped = wrapWithLogging(undefined, 'noop', fn);
    expect(wrapped).toBe(fn);
  });
});
