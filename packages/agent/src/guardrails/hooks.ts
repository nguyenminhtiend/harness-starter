import type { EventBus, Message } from '@harness/core';
import { GuardrailError } from '@harness/core';
import type { InputHook, OutputHook, RunContext } from '../types.ts';

export async function runInputHooks(
  hooks: InputHook[],
  messages: Message[],
  ctx: RunContext,
  bus?: EventBus,
): Promise<Message[]> {
  for (const hook of hooks) {
    const result = await hook({ messages, ctx });
    switch (result.action) {
      case 'pass':
        continue;
      case 'block':
        bus?.emit('guardrail', { runId: ctx.runId, phase: 'input', action: 'block' });
        throw new GuardrailError(`Input guardrail blocked: ${result.reason}`, {
          phase: 'input',
        });
      case 'rewrite':
        bus?.emit('guardrail', { runId: ctx.runId, phase: 'input', action: 'rewrite' });
        return result.messages;
    }
  }
  return messages;
}

export async function runOutputHooks(
  hooks: OutputHook[],
  message: Message,
  ctx: RunContext,
  bus?: EventBus,
): Promise<Message> {
  for (const hook of hooks) {
    const result = await hook({ message, ctx });
    switch (result.action) {
      case 'pass':
        continue;
      case 'block':
        bus?.emit('guardrail', { runId: ctx.runId, phase: 'output', action: 'block' });
        throw new GuardrailError(`Output guardrail blocked: ${result.reason}`, {
          phase: 'output',
        });
      case 'rewrite':
        bus?.emit('guardrail', { runId: ctx.runId, phase: 'output', action: 'rewrite' });
        return result.message;
    }
  }
  return message;
}
