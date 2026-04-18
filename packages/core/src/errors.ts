export type ErrorClass = 'provider' | 'tool' | 'validation' | 'guardrail' | 'budget' | 'loop';

interface HarnessErrorOpts {
  cause?: unknown;
  retriable?: boolean;
  context?: Record<string, unknown>;
}

export abstract class HarnessError extends Error {
  abstract readonly class: ErrorClass;
  readonly retriable: boolean;
  readonly context: Record<string, unknown>;

  constructor(message: string, opts: HarnessErrorOpts = {}) {
    super(message, opts.cause != null ? { cause: opts.cause } : undefined);
    this.name = this.constructor.name;
    this.retriable = opts.retriable ?? false;
    this.context = opts.context ?? {};
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      class: this.class,
      retriable: this.retriable,
      context: this.context,
    };
  }
}

// --- Subclasses ---

export type ProviderErrorKind =
  | 'rate_limit'
  | 'timeout'
  | 'server'
  | 'auth'
  | 'bad_request'
  | 'unknown';

const RETRIABLE_PROVIDER_KINDS = new Set<ProviderErrorKind>(['rate_limit', 'timeout', 'server']);

interface ProviderErrorOpts extends HarnessErrorOpts {
  kind: ProviderErrorKind;
  status?: number;
  retryAfter?: number;
}

export class ProviderError extends HarnessError {
  readonly class = 'provider' as const;
  readonly kind: ProviderErrorKind;
  readonly status: number | undefined;
  readonly retryAfter: number | undefined;

  constructor(message: string, opts: ProviderErrorOpts) {
    super(message, {
      ...opts,
      retriable: opts.retriable ?? RETRIABLE_PROVIDER_KINDS.has(opts.kind),
    });
    this.kind = opts.kind;
    this.status = opts.status;
    this.retryAfter = opts.retryAfter;
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), kind: this.kind, status: this.status };
  }
}

interface ToolErrorOpts extends HarnessErrorOpts {
  toolName: string;
}

export class ToolError extends HarnessError {
  readonly class = 'tool' as const;
  readonly toolName: string;

  constructor(message: string, opts: ToolErrorOpts) {
    super(message, opts);
    this.toolName = opts.toolName;
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), toolName: this.toolName };
  }
}

interface ValidationErrorOpts extends HarnessErrorOpts {
  zodIssues: unknown;
}

export class ValidationError extends HarnessError {
  readonly class = 'validation' as const;
  readonly zodIssues: unknown;

  constructor(message: string, opts: ValidationErrorOpts) {
    super(message, opts);
    this.zodIssues = opts.zodIssues;
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), zodIssues: this.zodIssues };
  }
}

interface GuardrailErrorOpts extends HarnessErrorOpts {
  phase: 'input' | 'output';
}

export class GuardrailError extends HarnessError {
  readonly class = 'guardrail' as const;
  readonly phase: 'input' | 'output';

  constructor(message: string, opts: GuardrailErrorOpts) {
    super(message, opts);
    this.phase = opts.phase;
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), phase: this.phase };
  }
}

interface BudgetExceededErrorOpts extends HarnessErrorOpts {
  kind: 'usd' | 'tokens';
  spent: number;
  limit: number;
}

export class BudgetExceededError extends HarnessError {
  readonly class = 'budget' as const;
  readonly kind: 'usd' | 'tokens';
  readonly spent: number;
  readonly limit: number;

  constructor(message: string, opts: BudgetExceededErrorOpts) {
    super(message, opts);
    this.kind = opts.kind;
    this.spent = opts.spent;
    this.limit = opts.limit;
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), kind: this.kind, spent: this.spent, limit: this.limit };
  }
}

interface LoopExhaustedErrorOpts extends HarnessErrorOpts {
  turns: number;
}

export class LoopExhaustedError extends HarnessError {
  readonly class = 'loop' as const;
  readonly turns: number;

  constructor(message: string, opts: LoopExhaustedErrorOpts) {
    super(message, opts);
    this.turns = opts.turns;
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), turns: this.turns };
  }
}
