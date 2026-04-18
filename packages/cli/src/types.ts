export interface CliConfig {
  readonly pattern: string;
  readonly models: readonly string[];
  readonly concurrency: number;
  readonly exportAdapters: readonly string[];
  readonly outputDir: string;
  readonly scoreThreshold: number | undefined;
}

export interface ScoreEntry {
  readonly name: string;
  readonly score: number;
}

export interface EvalRunResult {
  readonly file: string;
  readonly model: string | undefined;
  readonly scores: readonly ScoreEntry[];
  readonly averageScore: number;
  readonly durationMs: number;
  readonly error: string | undefined;
  readonly timestamp: string;
}

export interface MatrixResult {
  readonly results: readonly EvalRunResult[];
  readonly totalDurationMs: number;
  readonly models: readonly string[];
  readonly files: readonly string[];
}
