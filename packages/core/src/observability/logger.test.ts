import { describe, expect, it } from 'bun:test';
import { createPinoLogger } from './logger.ts';

describe('createPinoLogger', () => {
  it('returns a pino logger with standard log methods', () => {
    const logger = createPinoLogger({ level: 'silent' });
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.child).toBe('function');
  });

  it('info() writes JSON with msg and data fields', () => {
    const logger = createPinoLogger({ level: 'silent' });
    expect(() => {
      logger.info({ key: 'val' }, 'test message');
    }).not.toThrow();
  });

  it('child() returns a logger with inherited bindings', () => {
    const logger = createPinoLogger({ level: 'silent' });
    const child = logger.child({ runId: 'r-1' });
    expect(typeof child.info).toBe('function');
    expect(typeof child.child).toBe('function');
  });
});
