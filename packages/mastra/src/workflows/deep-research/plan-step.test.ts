import { describe, expect, test } from 'bun:test';
import { mockModel } from '../../agents/testing.ts';
import type { StepLogger } from '../lib/logged-step.ts';
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

  test('normalizes plain-string subquestions into objects', async () => {
    const planJson = JSON.stringify({
      summary: 'Bun research plan',
      subquestions: [
        'Why is Bun gaining popularity?',
        'How does Bun compare to Node.js?',
        'What are the key features of Bun?',
      ],
    });
    const model = mockModel([{ type: 'text', text: planJson }]);

    const plan = await generatePlan({
      model,
      question: 'Why is Bun popular?',
      depth: 'shallow',
    });

    expect(plan.subquestions).toHaveLength(3);
    expect(plan.subquestions[0]).toEqual({ id: 'sq1', question: 'Why is Bun gaining popularity?' });
    expect(plan.subquestions[2]).toEqual({
      id: 'sq3',
      question: 'What are the key features of Bun?',
    });
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

  test('emits agent.start and agent.finish when logger is provided', async () => {
    const planJson = JSON.stringify({
      summary: 'ok',
      subquestions: [{ id: 'sq1', question: 'why?' }],
    });
    const model = mockModel([{ type: 'text', text: planJson }]);

    const entries: { obj: Record<string, unknown>; msg: string }[] = [];
    const logger: StepLogger = {
      info(obj, msg) {
        entries.push({ obj, msg });
      },
    };

    await generatePlan({ model, question: 'test', logger });

    const agentLogs = entries.filter((e) => e.msg === 'agent.start' || e.msg === 'agent.finish');
    expect(agentLogs).toHaveLength(2);
    expect(agentLogs[0]).toMatchObject({
      obj: { agentId: 'deep-research-planner' },
      msg: 'agent.start',
    });
    expect(agentLogs[1]).toMatchObject({
      obj: { agentId: 'deep-research-planner' },
      msg: 'agent.finish',
    });
  });
});
