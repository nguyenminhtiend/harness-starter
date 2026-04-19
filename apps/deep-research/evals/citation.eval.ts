import * as fs from 'node:fs';
import { createScorer } from '@harness/eval';

if (!process.env.HARNESS_LIVE) {
  console.log('Skipping citation eval — set HARNESS_LIVE=1 to run');
  process.exit(0);
}

interface EvalRow {
  question: string;
  expectedDomains: string[];
}

const lines: EvalRow[] = fs
  .readFileSync(new URL('./fixtures/questions.jsonl', import.meta.url), 'utf-8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l));

const URL_RE = /https?:\/\/[^\s)"'<>]+/g;

export const citationPresenceScorer = createScorer<string, string, EvalRow>({
  name: 'citation-presence',
  description: 'Checks that the report contains at least one URL citation',
  scorer: ({ output }) => {
    if (typeof output !== 'string') {
      return 0;
    }
    const urls = output.match(URL_RE) || [];
    return urls.length > 0 ? 1 : 0;
  },
});

export const domainCoverageScorer = createScorer<string, string, EvalRow>({
  name: 'domain-coverage',
  description: 'Checks how many expected domains appear in the report citations',
  scorer: ({ output, expected }) => {
    if (typeof output !== 'string' || !expected?.expectedDomains?.length) {
      return 0;
    }
    const urls = output.match(URL_RE) || [];
    const matchedDomains = expected.expectedDomains.filter((domain) =>
      urls.some((url) => url.includes(domain)),
    );
    return matchedDomains.length / expected.expectedDomains.length;
  },
});

export { lines as data };
