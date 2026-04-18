export class InterruptSignal {
  constructor(public readonly reason?: string) {}
}

export function interrupt(reason?: string): never {
  throw new InterruptSignal(reason);
}
