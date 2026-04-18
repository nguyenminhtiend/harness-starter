import { z } from 'zod';
import type {
  Agent,
  AgentEvent,
  HandoffState,
  RunInput,
  RunOptions,
  RunResult,
  Tool,
  ToolContext,
} from '../types.ts';

export class HandoffSignal {
  constructor(
    public readonly target: Agent,
    public readonly carry?: HandoffState,
  ) {}
}

export function handoff(target: Agent, carry?: HandoffState): Tool<{ reason: string }, string> {
  return {
    name: `handoff_to_${(target as { id?: string }).id ?? 'agent'}`,
    description: 'Transfer the conversation to another agent',
    parameters: z.object({ reason: z.string() }),
    async execute(_args: { reason: string }, _ctx: ToolContext): Promise<string> {
      throw new HandoffSignal(target, carry);
    },
  };
}

export function createHandoffAgent(sourceAgent: Agent): Agent {
  async function run(input: RunInput, opts?: RunOptions): Promise<RunResult> {
    let currentAgent = sourceAgent;
    let currentInput = input;

    for (;;) {
      try {
        return await currentAgent.run(currentInput, opts);
      } catch (e) {
        if (e instanceof HandoffSignal) {
          currentAgent = e.target;
          currentInput = {
            ...currentInput,
            conversationId: currentInput.conversationId ?? crypto.randomUUID(),
            ...(e.carry ?? {}),
          };
          continue;
        }
        throw e;
      }
    }
  }

  async function* stream(input: RunInput, opts?: RunOptions): AsyncGenerator<AgentEvent, void> {
    let currentAgent = sourceAgent;
    let currentInput = input;

    for (;;) {
      try {
        yield* currentAgent.stream(currentInput, opts);
        return;
      } catch (e) {
        if (e instanceof HandoffSignal) {
          yield { type: 'handoff', from: 'source', to: 'target' };
          currentAgent = e.target;
          currentInput = {
            ...currentInput,
            conversationId: currentInput.conversationId ?? crypto.randomUUID(),
            ...(e.carry ?? {}),
          };
          continue;
        }
        throw e;
      }
    }
  }

  return { run, stream };
}
