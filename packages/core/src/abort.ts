export function linkedSignal(...signals: (AbortSignal | undefined)[]): AbortSignal {
  const ac = new AbortController();
  for (const signal of signals) {
    if (signal == null) {
      continue;
    }
    if (signal.aborted) {
      ac.abort(signal.reason);
      return ac.signal;
    }
    signal.addEventListener('abort', () => ac.abort(signal.reason), { once: true });
  }
  return ac.signal;
}

export function timeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

export function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException(signal.reason ?? 'The operation was aborted', 'AbortError');
  }
}
