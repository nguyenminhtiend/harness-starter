import { composeHarness } from '@harness/bootstrap';
import { createHttpApp } from '@harness/http';
import type { Hono } from 'hono';
import type { Config } from './config.ts';

export interface ComposedApp {
  readonly app: Hono;
  readonly shutdown: () => Promise<void>;
}

export function compose(config: Config): ComposedApp {
  const { deps, shutdown } = composeHarness({ logLevel: config.logLevel });
  return { app: createHttpApp(deps), shutdown };
}
