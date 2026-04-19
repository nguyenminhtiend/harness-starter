import { describe, expect, it } from 'bun:test';
import type { StreamEvent } from '@harness/core';
import { fakeProvider } from '@harness/core/testing';
import { Report } from '../schemas/report.ts';
import { createWriterAgent } from './writer.ts';

function textScript(text: string): StreamEvent[] {
  return [
    { type: 'text-delta', delta: text },
    { type: 'usage', tokens: { inputTokens: 100, outputTokens: 200, totalTokens: 300 } },
    { type: 'finish', reason: 'stop' },
  ];
}

const sampleReport = {
  title: 'CRDTs: Conflict-Free Replicated Data Types',
  sections: [
    {
      heading: 'Overview',
      body: 'CRDTs are data structures that can be replicated across multiple nodes and updated independently without coordination.',
    },
    {
      heading: 'Applications',
      body: 'CRDTs are used in collaborative editing tools, distributed databases, and real-time synchronization systems.',
    },
  ],
  references: [{ url: 'https://en.wikipedia.org/wiki/CRDT', title: 'Wikipedia: CRDT' }],
};

describe('createWriterAgent', () => {
  it('returns an agent with run and stream methods', () => {
    const provider = fakeProvider([{ events: textScript('{}') }]);
    const agent = createWriterAgent(provider);
    expect(agent.run).toBeFunction();
    expect(agent.stream).toBeFunction();
  });

  it('produces output parseable as a Report', async () => {
    const provider = fakeProvider([{ events: textScript(JSON.stringify(sampleReport)) }]);
    const agent = createWriterAgent(provider);

    const result = await agent.run({
      userMessage:
        'Write a report from these findings: CRDTs are conflict-free replicated data types...',
    });

    const parsed = Report.parse(JSON.parse(result.finalMessage as string));
    expect(parsed.title).toBe(sampleReport.title);
    expect(parsed.sections).toHaveLength(2);
    expect(parsed.references).toHaveLength(1);
  });

  it('can be used as a handoff target', async () => {
    const provider = fakeProvider([{ events: textScript(JSON.stringify(sampleReport)) }]);
    const agent = createWriterAgent(provider);

    const result = await agent.run({
      userMessage: 'Compile the research findings into a report.',
      conversationId: 'handoff-conv-1',
    });

    expect(result.finalMessage).toBeDefined();
    expect(result.turns).toBe(1);
  });
});
