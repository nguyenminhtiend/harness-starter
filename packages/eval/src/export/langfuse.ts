import type { EvalResults } from './types.ts';

export interface LangfuseSpan {
  update(data: Record<string, unknown>): void;
  end(data?: Record<string, unknown>): void;
}

export interface LangfuseTrace {
  span(data: Record<string, unknown>): LangfuseSpan;
  update(data: Record<string, unknown>): void;
}

export interface LangfuseClient {
  trace(data: Record<string, unknown>): LangfuseTrace;
}

export function toLangfuse(results: EvalResults, client: LangfuseClient): void {
  const trace = client.trace({
    name: `eval:${results.name}`,
    metadata: {
      model: results.model,
      sampleCount: results.samples.length,
      createdAt: results.createdAt,
      ...results.metadata,
    },
  });

  for (const sample of results.samples) {
    const span = trace.span({
      name: `sample:${sample.id}`,
      input: sample.input,
    });

    span.end({
      output: sample.output,
      metadata: {
        expected: sample.expected,
        scores: sample.scores,
        durationMs: sample.durationMs,
      },
    });
  }

  const scorerNames = [...new Set(results.samples.flatMap((s) => Object.keys(s.scores)))];
  const aggregateScores: Record<string, number> = {};
  for (const name of scorerNames) {
    const values = results.samples
      .map((s) => s.scores[name]?.score)
      .filter((v): v is number => v !== undefined);
    if (values.length > 0) {
      aggregateScores[name] = values.reduce((a, b) => a + b, 0) / values.length;
    }
  }

  trace.update({ metadata: { aggregateScores } });
}
