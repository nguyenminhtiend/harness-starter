import { describe, expect, it } from 'bun:test';
import { createSpinner } from './spinner.ts';

describe('createSpinner', () => {
  it('returns an object with start and stop methods', () => {
    const spinner = createSpinner();
    expect(typeof spinner.start).toBe('function');
    expect(typeof spinner.stop).toBe('function');
  });

  it('stop is safe to call without start', () => {
    const spinner = createSpinner();
    expect(() => spinner.stop()).not.toThrow();
  });

  it('stop is safe to call multiple times', () => {
    const spinner = createSpinner();
    spinner.start();
    expect(() => {
      spinner.stop();
      spinner.stop();
    }).not.toThrow();
  });

  it('can be restarted after stop', () => {
    const spinner = createSpinner();
    spinner.start();
    spinner.stop();
    expect(() => spinner.start()).not.toThrow();
    spinner.stop();
  });
});
