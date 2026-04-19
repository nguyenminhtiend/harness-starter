export function setupSigint(opts: {
  isStreaming: () => boolean;
  onAbort: () => void;
  onExit: () => void;
}): void {
  process.on('SIGINT', () => {
    if (opts.isStreaming()) {
      opts.onAbort();
      return;
    }
    opts.onExit();
  });
  process.on('SIGTERM', opts.onExit);
}
