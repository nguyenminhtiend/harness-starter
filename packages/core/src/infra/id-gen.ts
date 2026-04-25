export interface IdGen {
  next(): string;
}

export function createCryptoIdGen(): IdGen {
  return {
    next() {
      return crypto.randomUUID();
    },
  };
}
