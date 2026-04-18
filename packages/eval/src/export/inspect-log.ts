import type { EvalResults, InspectLog, InspectLogSample } from './types.ts';

export function toInspectLog(results: EvalResults): InspectLog {
  const samples: InspectLogSample[] = results.samples.map((s) => ({
    id: s.id,
    input: s.input,
    output: s.output,
    target: s.expected,
    scores: Object.fromEntries(
      Object.entries(s.scores).map(([name, { score, metadata }]) => {
        const rationale = metadata?.rationale;
        return [
          name,
          {
            value: score,
            ...(typeof rationale === 'string' ? { explanation: rationale } : {}),
          },
        ];
      }),
    ),
  }));

  const scorerNames = new Set(results.samples.flatMap((s) => Object.keys(s.scores)));
  const scoreAggregates = [...scorerNames].map((name) => {
    const values = results.samples
      .map((s) => s.scores[name]?.score)
      .filter((v): v is number => v !== undefined);
    const mean = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    return {
      name,
      scorer: name,
      metrics: { accuracy: { value: mean, name: 'accuracy' } },
    };
  });

  const log: InspectLog = {
    version: 2,
    status: 'success',
    eval: {
      task: results.name,
      created: results.createdAt ?? new Date().toISOString(),
      dataset: { name: results.name, samples: results.samples.length },
    },
    results: { scores: scoreAggregates },
    samples,
  };

  if (results.model !== undefined) {
    log.eval.model = results.model;
  }

  return log;
}
