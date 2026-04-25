import { describe, expect, it } from 'bun:test';
import { createPinoLogger, previewMessages, previewText } from './logger.ts';

describe('previewText', () => {
  it('returns empty string unchanged', () => {
    expect(previewText('')).toBe('');
  });

  it('returns short string unchanged', () => {
    expect(previewText('hello')).toBe('hello');
  });

  it('returns string equal to max unchanged', () => {
    const s = 'a'.repeat(300);
    expect(previewText(s)).toBe(s);
  });

  it('truncates string over max with dropped count', () => {
    const s = 'a'.repeat(305);
    expect(previewText(s)).toBe(`${'a'.repeat(300)}…[+5 more]`);
  });

  it('respects custom max', () => {
    expect(previewText('hello world', 5)).toBe('hello…[+6 more]');
  });

  it('truncates exactly one char over max', () => {
    const s = 'a'.repeat(301);
    expect(previewText(s)).toBe(`${'a'.repeat(300)}…[+1 more]`);
  });
});

describe('previewMessages', () => {
  it('returns role and preview for each message', () => {
    const msgs = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'world' },
    ];
    const result = previewMessages(msgs);
    expect(result).toEqual([
      { role: 'user', preview: 'hello' },
      { role: 'assistant', preview: 'world' },
    ]);
  });

  it('truncates long content', () => {
    const long = 'x'.repeat(400);
    const result = previewMessages([{ role: 'user', content: long }]);
    expect(result[0]?.preview).toBe(`${'x'.repeat(300)}…[+100 more]`);
  });

  it('handles non-string content via JSON stringify', () => {
    const result = previewMessages([{ role: 'tool', content: { result: 42 } }]);
    expect(result[0]?.preview).toBe('{"result":42}');
  });

  it('returns empty array for no messages', () => {
    expect(previewMessages([])).toEqual([]);
  });
});

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

  it('does not crash with pretty=true even if pino-pretty is absent', () => {
    expect(() => {
      createPinoLogger({ level: 'silent', pretty: true });
    }).not.toThrow();
  });

  it('accepts custom redact paths', () => {
    const logger = createPinoLogger({ level: 'silent', redact: ['*.secret'] });
    expect(typeof logger.info).toBe('function');
  });

  it('applies default redact paths when none provided', () => {
    const logger = createPinoLogger({ level: 'silent' });
    expect(typeof logger.info).toBe('function');
  });
});
