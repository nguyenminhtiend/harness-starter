import type { AgentEvent } from '@harness/agent';
import type { StreamEvent } from '@harness/core';

export function planResponse(plan: object): StreamEvent[] {
  return [
    { type: 'text-delta', delta: JSON.stringify(plan) },
    { type: 'usage', tokens: { inputTokens: 50, outputTokens: 30, totalTokens: 80 } },
    { type: 'finish', reason: 'stop' },
  ];
}

export function textScript(text: string): StreamEvent[] {
  return [
    { type: 'text-delta', delta: text },
    { type: 'usage', tokens: { inputTokens: 50, outputTokens: 50, totalTokens: 100 } },
    { type: 'finish', reason: 'stop' },
  ];
}

export const samplePlan = {
  question: 'What is CRDT?',
  subquestions: [{ id: 'q1', question: 'What are CRDTs?', searchQueries: ['CRDT'] }],
};

export const sampleFinding = {
  subquestionId: 'q1',
  summary: 'CRDTs are conflict-free replicated data types.',
  sourceUrls: ['https://en.wikipedia.org/wiki/CRDT'],
};

export const sampleReport = {
  title: 'CRDTs',
  sections: [{ heading: 'Overview', body: 'CRDTs are distributed data structures.' }],
  references: [{ url: 'https://en.wikipedia.org/wiki/CRDT' }],
};

export const factCheckPass = { pass: true, issues: [] as string[] };
export const factCheckFail = { pass: false, issues: ['Bad citation'] };

export async function collectEvents(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const ev of stream) {
    events.push(ev);
  }
  return events;
}

export function makeTestCtx(
  overrides?: Partial<{ runId: string; conversationId: string; signal: AbortSignal }>,
) {
  return {
    runId: overrides?.runId ?? 'r1',
    conversationId: overrides?.conversationId ?? 'c1',
    signal: overrides?.signal ?? new AbortController().signal,
  };
}
