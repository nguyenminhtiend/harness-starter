export interface Clock {
  now(): string;
}

export function createSystemClock(): Clock {
  return {
    now() {
      return new Date().toISOString();
    },
  };
}
