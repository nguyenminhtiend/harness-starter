import type { Message, Provider } from '@harness/core';

export function insertCacheBreakpoints(messages: Message[], provider: Provider): Message[] {
  if (!provider.capabilities.caching) {
    return messages;
  }

  let inserted = false;
  return messages.map((m, i) => {
    if (inserted) {
      return m;
    }
    if (m.cacheBoundary) {
      inserted = true;
      return m;
    }
    // Auto-insert after the last system message
    if (m.role === 'system') {
      const next = messages[i + 1];
      if (!next || next.role !== 'system') {
        inserted = true;
        return { ...m, cacheBoundary: true };
      }
    }
    return m;
  });
}
