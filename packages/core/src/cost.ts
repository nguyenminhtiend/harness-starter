import type { EventBus } from './events/bus.ts';

export interface PriceBookEntry {
  inputPerMTok: number;
  outputPerMTok: number;
  cachedInputPerMTok?: number;
  thinkingPerMTok?: number;
}

export interface PriceBook {
  [modelId: string]: PriceBookEntry;
}

export function trackCost(bus: EventBus, prices: PriceBook): () => void {
  const modelByRun = new Map<string, string>();

  const unsubCall = bus.on('provider.call', (e) => {
    modelByRun.set(e.runId, e.providerId);
  });

  const unsubFinish = bus.on('run.finish', (e) => {
    modelByRun.delete(e.runId);
  });

  const unsubError = bus.on('run.error', (e) => {
    modelByRun.delete(e.runId);
  });

  const unsubUsage = bus.on('provider.usage', (e) => {
    const modelId = modelByRun.get(e.runId);
    if (!modelId) {
      return;
    }
    const entry = prices[modelId];
    if (!entry) {
      return;
    }

    const inputTokens = e.tokens.inputTokens ?? 0;
    const outputTokens = e.tokens.outputTokens ?? 0;
    const cachedInputTokens = e.tokens.cachedInputTokens ?? 0;
    const reasoningTokens = e.tokens.reasoningTokens ?? 0;

    const clampedCached = Math.min(cachedInputTokens, inputTokens);
    const regularInput = Math.max(0, inputTokens - clampedCached);
    const cachedInputCost =
      entry.cachedInputPerMTok != null
        ? (clampedCached / 1e6) * entry.cachedInputPerMTok
        : (clampedCached / 1e6) * entry.inputPerMTok;
    const inputCost = (regularInput / 1e6) * entry.inputPerMTok + cachedInputCost;

    let outputCost: number;
    if (reasoningTokens > 0 && entry.thinkingPerMTok != null) {
      const clampedReasoning = Math.min(reasoningTokens, outputTokens);
      const regularOutput = Math.max(0, outputTokens - clampedReasoning);
      outputCost =
        (regularOutput / 1e6) * entry.outputPerMTok +
        (clampedReasoning / 1e6) * entry.thinkingPerMTok;
    } else {
      outputCost = (outputTokens / 1e6) * entry.outputPerMTok;
    }

    (e as { costUSD?: number }).costUSD = inputCost + outputCost;
  });

  return () => {
    unsubCall();
    unsubUsage();
    unsubFinish();
    unsubError();
    modelByRun.clear();
  };
}
