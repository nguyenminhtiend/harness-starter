import { describe, expect, test } from 'bun:test';
import { mockModel } from '../../agents/testing.ts';
import type { StepLogger } from '../lib/logged-step.ts';
import { checkFacts } from './fact-check-step.ts';

describe('checkFacts', () => {
  test('returns pass=true when the model says citations are valid', async () => {
    const json = JSON.stringify({ pass: true, issues: [] });
    const model = mockModel([{ type: 'text', text: json }]);
    const result = await checkFacts({
      model,
      reportText: '# Report\nSome facts [1].\n\n## References\n1. [A](https://example.com/a)',
      findings: [{ subquestionId: 'sq1', summary: 'facts', sourceUrls: ['https://example.com/a'] }],
    });
    expect(result.pass).toBe(true);
    expect(result.issues).toEqual([]);
  });

  test('returns pass=false with issues when citations are bad', async () => {
    const json = JSON.stringify({
      pass: false,
      issues: ['Citation [2] references a URL not found in sources'],
    });
    const model = mockModel([{ type: 'text', text: json }]);
    const result = await checkFacts({
      model,
      reportText: '# Report\nClaim [1] [2].\n\nRefs: https://example.com/a https://fake.com/b',
      findings: [{ subquestionId: 'sq1', summary: 'facts', sourceUrls: ['https://example.com/a'] }],
    });
    expect(result.pass).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toContain('not found');
  });

  test('handles markdown-fenced JSON response', async () => {
    const json = JSON.stringify({ pass: true, issues: [] });
    const fenced = `\`\`\`json\n${json}\n\`\`\``;
    const model = mockModel([{ type: 'text', text: fenced }]);
    const result = await checkFacts({
      model,
      reportText: '# OK',
      findings: [],
    });
    expect(result.pass).toBe(true);
  });

  test('includes warning about unfetched URLs in the prompt', async () => {
    const json = JSON.stringify({
      pass: false,
      issues: ['https://fabricated.com was not in research sources'],
    });
    const model = mockModel([{ type: 'text', text: json }]);
    const result = await checkFacts({
      model,
      reportText: 'Claim citing https://fabricated.com',
      findings: [{ subquestionId: 'sq1', summary: 'facts', sourceUrls: ['https://real.com'] }],
    });
    expect(result.pass).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  test('emits agent.start and agent.finish when logger is provided', async () => {
    const json = JSON.stringify({ pass: true, issues: [] });
    const model = mockModel([{ type: 'text', text: json }]);

    const entries: { obj: Record<string, unknown>; msg: string }[] = [];
    const logger: StepLogger = {
      info(obj, msg) {
        entries.push({ obj, msg });
      },
    };

    await checkFacts({
      model,
      reportText: '# Report',
      findings: [],
      logger,
    });

    const agentLogs = entries.filter((e) => e.msg === 'agent.start' || e.msg === 'agent.finish');
    expect(agentLogs).toHaveLength(2);
    expect(agentLogs[0].obj.agentId).toBe('deep-research-fact-checker');
    expect(agentLogs[1].msg).toBe('agent.finish');
  });
});
