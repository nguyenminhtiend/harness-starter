import type { ExecutionContext } from '@harness/core';

export function fakeCtx(overrides?: Partial<ExecutionContext>): ExecutionContext {
  return {
    runId: 'r1',
    settings: {},
    memory: null,
    signal: new AbortController().signal,
    approvals: { request: () => Promise.reject(new Error('not configured')) },
    logger: { info() {}, debug() {}, error() {}, warn() {}, child: () => ({}) } as never,
    ...overrides,
  };
}
