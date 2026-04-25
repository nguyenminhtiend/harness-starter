export interface StepLogger {
  info(obj: Record<string, unknown>, msg: string): void;
}

export interface StepTimer {
  end(status: 'success' | 'error'): void;
}

/**
 * Start logging a workflow step. Call timer.end('success' | 'error') when done.
 * Safe to call with undefined logger (no-op).
 */
export function startStepLog(logger: StepLogger | undefined, stepId: string): StepTimer {
  const start = performance.now();
  logger?.info({ stepId }, 'step.start');
  return {
    end(status) {
      const durationMs = Math.round(performance.now() - start);
      logger?.info({ stepId, durationMs, status }, 'step.end');
    },
  };
}

/**
 * Wraps an async function with step.start / step.end logging.
 * Returns the original function unchanged when no logger is provided.
 */
export function wrapWithLogging<TCtx, TResult>(
  logger: StepLogger | undefined,
  stepId: string,
  fn: (ctx: TCtx) => Promise<TResult>,
): (ctx: TCtx) => Promise<TResult> {
  if (!logger) {
    return fn;
  }
  return async (ctx) => {
    const timer = startStepLog(logger, stepId);
    try {
      const result = await fn(ctx);
      timer.end('success');
      return result;
    } catch (err) {
      timer.end('error');
      throw err;
    }
  };
}
