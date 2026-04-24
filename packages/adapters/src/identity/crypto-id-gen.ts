import type { IdGen } from '@harness/core';

export function createCryptoIdGen(): IdGen {
  return {
    next() {
      return crypto.randomUUID();
    },
  };
}
