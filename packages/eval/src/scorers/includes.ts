import { createScorer } from '../create-scorer.ts';

export interface IncludesOpts {
  ignoreCase?: boolean;
}

export function includes(opts?: IncludesOpts) {
  const ignoreCase = opts?.ignoreCase ?? false;
  return createScorer<string, string, string>({
    name: 'includes',
    description: 'Returns 1 if output contains expected as a substring, 0 otherwise.',
    scorer: ({ output, expected }) => {
      if (expected === undefined) {
        return 0;
      }
      const a = ignoreCase ? String(output).toLowerCase() : String(output);
      const b = ignoreCase ? String(expected).toLowerCase() : String(expected);
      return a.includes(b) ? 1 : 0;
    },
  });
}
