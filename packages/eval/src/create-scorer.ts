export interface ScorerScore {
  score: number;
  name: string;
  description?: string | undefined;
  metadata?: unknown;
}

export interface ScoreInput<TInput, TOutput, TExpected> {
  input: TInput;
  output: TOutput;
  expected?: TExpected;
}

export type UserScore = number | { score: number; metadata?: unknown };

export interface ScorerOpts<TInput, TOutput, TExpected> {
  name: string;
  description?: string | undefined;
  scorer: (input: ScoreInput<TInput, TOutput, TExpected>) => UserScore | Promise<UserScore>;
}

export type Scorer<TInput, TOutput, TExpected> = (
  opts: ScoreInput<TInput, TOutput, TExpected>,
) => Promise<ScorerScore>;

/**
 * Local createScorer matching Evalite's API. Avoids importing evalite at
 * runtime so scorer files can be tested under bun:test without pulling in
 * Vitest internals.
 */
export function createScorer<TInput, TOutput, TExpected = TOutput>(
  opts: ScorerOpts<TInput, TOutput, TExpected>,
): Scorer<TInput, TOutput, TExpected> {
  return async (input) => {
    const raw = await opts.scorer(input);
    const score = typeof raw === 'object' ? raw.score : raw;
    if (!Number.isFinite(score)) {
      return {
        score: 0,
        name: opts.name,
        description: opts.description,
        metadata: { error: `Invalid score value: ${score}` },
      };
    }
    if (typeof raw === 'object') {
      return {
        score,
        metadata: raw.metadata,
        description: opts.description,
        name: opts.name,
      };
    }
    return { description: opts.description, name: opts.name, score };
  };
}
