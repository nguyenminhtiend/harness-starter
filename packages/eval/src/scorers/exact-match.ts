import { createScorer } from '../create-scorer.ts';

export const exactMatch = createScorer<string, string, string>({
  name: 'exactMatch',
  description: 'Returns 1 if output exactly matches expected, 0 otherwise.',
  scorer: ({ output, expected }) => {
    return output === expected ? 1 : 0;
  },
});
