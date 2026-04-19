export function formatUsage(opts: {
  totalTokens: number;
  durationMs: number;
  cost?: number;
}): string {
  const tokens = opts.totalTokens.toLocaleString('en-US');
  const duration = (opts.durationMs / 1000).toFixed(1);
  const parts = [`${tokens} tokens`, `${duration}s`];
  if (opts.cost !== undefined) {
    parts.push(`$${opts.cost.toFixed(2)}`);
  }
  return `(${parts.join(' · ')})`;
}
