import type { PriceBook } from './cost.ts';

export const defaultPrices: PriceBook = {
  'gpt-4o': {
    inputPerMTok: 2.5,
    outputPerMTok: 10.0,
    cachedInputPerMTok: 1.25,
  },
  'gpt-4o-mini': {
    inputPerMTok: 0.15,
    outputPerMTok: 0.6,
    cachedInputPerMTok: 0.075,
  },
  'gpt-4.1': {
    inputPerMTok: 2.0,
    outputPerMTok: 8.0,
    cachedInputPerMTok: 0.5,
  },
  'gpt-4.1-mini': {
    inputPerMTok: 0.4,
    outputPerMTok: 1.6,
    cachedInputPerMTok: 0.1,
  },
  'gpt-4.1-nano': {
    inputPerMTok: 0.1,
    outputPerMTok: 0.4,
    cachedInputPerMTok: 0.025,
  },
  'claude-opus-4': {
    inputPerMTok: 15.0,
    outputPerMTok: 75.0,
    cachedInputPerMTok: 1.5,
    thinkingPerMTok: 75.0,
  },
  'claude-sonnet-4': {
    inputPerMTok: 3.0,
    outputPerMTok: 15.0,
    cachedInputPerMTok: 0.3,
    thinkingPerMTok: 15.0,
  },
  'claude-3.5-sonnet': {
    inputPerMTok: 3.0,
    outputPerMTok: 15.0,
    cachedInputPerMTok: 0.3,
  },
  'claude-3.5-haiku': {
    inputPerMTok: 0.8,
    outputPerMTok: 4.0,
    cachedInputPerMTok: 0.08,
  },
};
