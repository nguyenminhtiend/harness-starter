import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import pino from 'pino';
import { accessLogger } from './logger.ts';

interface LogEntry {
  readonly level: number;
  readonly msg: string;
  readonly [key: string]: unknown;
}

function createCapturingLogger(): { logger: pino.Logger; entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  const dest = new (require('node:stream').Writable)({
    write(chunk: Buffer, _encoding: string, cb: () => void) {
      entries.push(JSON.parse(chunk.toString()));
      cb();
    },
  });
  const logger = pino({ level: 'debug' }, dest);
  return { logger, entries };
}

describe('accessLogger middleware', () => {
  it('logs an info line for every request', async () => {
    const { logger, entries } = createCapturingLogger();
    const app = new Hono();
    app.use('*', accessLogger(logger));
    app.get('/test', (c) => c.json({ ok: true }));

    await app.request('/test');

    const accessLogs = entries.filter((l) => l.msg === 'request');
    expect(accessLogs).toHaveLength(1);
    expect(accessLogs[0].level).toBe(30);
  });

  it('includes method, path, status, and durationMs in log data', async () => {
    const { logger, entries } = createCapturingLogger();
    const app = new Hono();
    app.use('*', accessLogger(logger));
    app.get('/hello', (c) => c.json({ ok: true }));

    await app.request('/hello');

    const entry = entries.find((l) => l.msg === 'request');
    expect(entry?.method).toBe('GET');
    expect(entry?.path).toBe('/hello');
    expect(entry?.status).toBe(200);
    expect(typeof entry?.durationMs).toBe('number');
  });

  it('includes requestId when set by upstream middleware', async () => {
    const { logger, entries } = createCapturingLogger();
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('requestId', 'req-123');
      await next();
    });
    app.use('*', accessLogger(logger));
    app.get('/test', (c) => c.json({ ok: true }));

    await app.request('/test');

    const entry = entries.find((l) => l.msg === 'request');
    expect(entry?.requestId).toBe('req-123');
  });

  it('logs 5xx errors at error level', async () => {
    const { logger, entries } = createCapturingLogger();
    const app = new Hono();
    app.use('*', accessLogger(logger));
    app.get('/crash', () => new Response('Internal Server Error', { status: 500 }));

    await app.request('/crash');

    const entry = entries.find((l) => l.msg === 'request');
    expect(entry?.level).toBe(50);
    expect(entry?.status).toBe(500);
  });

  it('logs 4xx at warn level', async () => {
    const { logger, entries } = createCapturingLogger();
    const app = new Hono();
    app.use('*', accessLogger(logger));
    app.get('/missing', (c) => c.json({ error: 'not found' }, 404));

    await app.request('/missing');

    const entry = entries.find((l) => l.msg === 'request');
    expect(entry?.level).toBe(40);
  });
});
