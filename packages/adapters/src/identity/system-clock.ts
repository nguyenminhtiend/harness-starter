import type { Clock } from '@harness/core';

export function createSystemClock(): Clock {
  return {
    now() {
      return new Date().toISOString();
    },
  };
}
