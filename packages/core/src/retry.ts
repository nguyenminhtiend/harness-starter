import { ProviderError } from './errors.ts';
import type { EventBus } from './events/bus.ts';

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: 'full' | 'none';
  retryOn: (e: unknown) => boolean;
}

const DEFAULT_POLICY: RetryPolicy = {
  maxAttempts: 4,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
  jitter: 'full',
  retryOn: (e: unknown) => (e instanceof ProviderError && e.retriable) || isNetworkError(e),
};

function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError && typeof e.message === 'string') {
    const msg = e.message.toLowerCase();
    return msg.includes('fetch') || msg.includes('network') || msg.includes('econnrefused');
  }
  return false;
}

function computeDelay(attempt: number, policy: RetryPolicy, retryAfterMs?: number): number {
  const exponential = Math.min(policy.baseDelayMs * 2 ** attempt, policy.maxDelayMs);
  const base = retryAfterMs != null ? Math.max(exponential, retryAfterMs) : exponential;
  if (policy.jitter === 'full') {
    return Math.floor(Math.random() * base);
  }
  return base;
}

function getRetryAfterMs(error: unknown): number | undefined {
  if (error instanceof ProviderError && error.retryAfter != null) {
    return error.retryAfter;
  }
  return undefined;
}

export interface WithRetryOpts {
  signal?: AbortSignal;
  bus?: EventBus;
  runId?: string;
}

export async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  policy: Partial<RetryPolicy> = {},
  opts: WithRetryOpts = {},
): Promise<T> {
  const resolved: RetryPolicy = { ...DEFAULT_POLICY, ...policy };
  const { signal, bus, runId } = opts;

  let lastError: unknown;

  for (let attempt = 0; attempt < resolved.maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw new DOMException(signal.reason ?? 'The operation was aborted', 'AbortError');
    }

    try {
      return await fn(signal ?? new AbortController().signal);
    } catch (e) {
      lastError = e;

      if (!resolved.retryOn(e)) {
        throw e;
      }

      if (attempt + 1 >= resolved.maxAttempts) {
        break;
      }

      const retryAfterMs = getRetryAfterMs(e);
      const delayMs = computeDelay(attempt, resolved, retryAfterMs);

      if (bus && runId) {
        bus.emit('provider.retry', { runId, attempt: attempt + 1, delayMs, error: e });
      }

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delayMs);
        if (signal) {
          const onAbort = () => {
            clearTimeout(timer);
            reject(new DOMException(signal.reason ?? 'The operation was aborted', 'AbortError'));
          };
          if (signal.aborted) {
            clearTimeout(timer);
            reject(new DOMException(signal.reason ?? 'The operation was aborted', 'AbortError'));
            return;
          }
          signal.addEventListener('abort', onAbort, { once: true });
        }
      });
    }
  }

  throw lastError;
}
