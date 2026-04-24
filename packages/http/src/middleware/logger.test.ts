import { describe, expect, it } from 'bun:test';
import type { Logger } from '@harness/core';
import { Hono } from 'hono';
import { accessLogger } from './logger.ts';

interface LogEntry {
  readonly level: string;
  readonly msg: string;
  readonly data?: Record<string, unknown>;
}

function createCapturingLogger(): { logger: Logger; logs: LogEntry[] } {
  const logs: LogEntry[] = [];
  const logger: Logger = {
    debug(msg, data) {
      logs.push({ level: 'debug', msg, data });
    },
    info(msg, data) {
      logs.push({ level: 'info', msg, data });
    },
    warn(msg, data) {
      logs.push({ level: 'warn', msg, data });
    },
    error(msg, data) {
      logs.push({ level: 'error', msg, data });
    },
    child(_bindings) {
      return logger;
    },
  };
  return { logger, logs };
}

describe('accessLogger middleware', () => {
  it('logs an info line for every request', async () => {
    const { logger, logs } = createCapturingLogger();
    const app = new Hono();
    app.use('*', accessLogger(logger));
    app.get('/test', (c) => c.json({ ok: true }));

    await app.request('/test');

    const accessLogs = logs.filter((l) => l.msg === 'request');
    expect(accessLogs).toHaveLength(1);
    expect(accessLogs[0].level).toBe('info');
  });

  it('includes method, path, status, and durationMs in log data', async () => {
    const { logger, logs } = createCapturingLogger();
    const app = new Hono();
    app.use('*', accessLogger(logger));
    app.get('/hello', (c) => c.json({ ok: true }));

    await app.request('/hello');

    const entry = logs.find((l) => l.msg === 'request');
    expect(entry?.data?.method).toBe('GET');
    expect(entry?.data?.path).toBe('/hello');
    expect(entry?.data?.status).toBe(200);
    expect(typeof entry?.data?.durationMs).toBe('number');
  });

  it('includes requestId when set by upstream middleware', async () => {
    const { logger, logs } = createCapturingLogger();
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('requestId', 'req-123');
      await next();
    });
    app.use('*', accessLogger(logger));
    app.get('/test', (c) => c.json({ ok: true }));

    await app.request('/test');

    const entry = logs.find((l) => l.msg === 'request');
    expect(entry?.data?.requestId).toBe('req-123');
  });

  it('logs 5xx errors at error level', async () => {
    const { logger, logs } = createCapturingLogger();
    const app = new Hono();
    app.use('*', accessLogger(logger));
    app.get('/crash', () => {
      return new Response('Internal Server Error', { status: 500 });
    });

    await app.request('/crash');

    const entry = logs.find((l) => l.msg === 'request');
    expect(entry?.level).toBe('error');
    expect(entry?.data?.status).toBe(500);
  });

  it('logs 4xx at warn level', async () => {
    const { logger, logs } = createCapturingLogger();
    const app = new Hono();
    app.use('*', accessLogger(logger));
    app.get('/missing', (c) => c.json({ error: 'not found' }, 404));

    await app.request('/missing');

    const entry = logs.find((l) => l.msg === 'request');
    expect(entry?.level).toBe('warn');
  });
});
