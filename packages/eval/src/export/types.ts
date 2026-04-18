export interface EvalSample {
  id: string;
  input: unknown;
  output: unknown;
  expected?: unknown;
  scores: Record<string, { score: number; metadata?: Record<string, unknown> | undefined }>;
  durationMs?: number | undefined;
}

export interface EvalResults {
  name: string;
  model?: string | undefined;
  samples: EvalSample[];
  metadata?: Record<string, unknown> | undefined;
  createdAt?: string | undefined;
}

export interface InspectLogEval {
  task: string;
  model?: string | undefined;
  created: string;
  dataset?: { name?: string | undefined; samples: number } | undefined;
}

export interface InspectLogResults {
  scores: Array<{
    name: string;
    scorer: string;
    metrics: Record<string, { value: number; name: string }>;
  }>;
}

export interface InspectLogSample {
  id: string;
  input: unknown;
  output: unknown;
  target?: unknown;
  scores: Record<
    string,
    { value: number; answer?: string | undefined; explanation?: string | undefined }
  >;
}

export interface InspectLog {
  version: number;
  status: 'started' | 'success' | 'cancelled' | 'error';
  eval: InspectLogEval;
  plan?: Record<string, unknown> | undefined;
  results?: InspectLogResults | undefined;
  samples?: InspectLogSample[] | undefined;
}
