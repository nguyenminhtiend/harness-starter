import { describe, expect, test } from 'bun:test';
import { mockModel } from '@harness/agents/testing';
import { generatePlan } from './plan-step.ts';

describe('generatePlan', () => {
  test('parses subquestions from a valid JSON model response', async () => {
    const planJson = JSON.stringify({
      summary: 'Three angles on the topic',
      subquestions: [
        { id: 'sq1', question: 'What is the history?' },
        { id: 'sq2', question: 'What are the main arguments?' },
        { id: 'sq3', question: 'Who are the key figures?' },
      ],
    });
    const model = mockModel([{ type: 'text', text: planJson }]);

    const plan = await generatePlan({
      model,
      question: 'Explain the migration',
      depth: 'shallow',
    });

    expect(plan.subquestions).toHaveLength(3);
    expect(plan.summary).toContain('angles');
  });

  test('extracts JSON wrapped in markdown fences', async () => {
    const planJson = JSON.stringify({
      summary: 'ok',
      subquestions: [{ id: 'sq1', question: 'why?' }],
    });
    const fenced = `\`\`\`json\n${planJson}\n\`\`\``;
    const model = mockModel([{ type: 'text', text: fenced }]);

    const plan = await generatePlan({
      model,
      question: 'test',
      depth: 'medium',
    });

    expect(plan.subquestions).toHaveLength(1);
  });

  test('uses depth to hint at subquestion count', async () => {
    const planJson = JSON.stringify({
      summary: 'deep scan',
      subquestions: Array.from({ length: 8 }, (_, i) => ({
        id: `sq${i + 1}`,
        question: `Question ${i + 1}`,
      })),
    });
    const model = mockModel([{ type: 'text', text: planJson }]);
    const plan = await generatePlan({ model, question: 'test', depth: 'deep' });
    expect(plan.subquestions.length).toBeGreaterThanOrEqual(5);
  });
});
