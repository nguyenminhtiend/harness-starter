import { describe, expect, it } from 'bun:test';
import type { Logger } from './logger.ts';
import { createPinoLogger } from './logger.ts';

describe('PinoLogger', () => {
  it('satisfies the Logger interface', () => {
    const logger: Logger = createPinoLogger();
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.child).toBe('function');
  });

  it('child() returns a Logger with the same interface', () => {
    const logger = createPinoLogger();
    const child: Logger = logger.child({ runId: 'r-1' });
    expect(typeof child.debug).toBe('function');
    expect(typeof child.info).toBe('function');
    expect(typeof child.warn).toBe('function');
    expect(typeof child.error).toBe('function');
    expect(typeof child.child).toBe('function');
  });

  it('does not throw when logging', () => {
    const logger = createPinoLogger({ level: 'silent' });
    expect(() => {
      logger.debug('test');
      logger.info('test', { key: 'val' });
      logger.warn('test');
      logger.error('test');
    }).not.toThrow();
  });
});
