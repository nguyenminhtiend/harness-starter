import type {
  EventBus,
  GenerateRequest,
  Message,
  MessagePart,
  Provider,
  RetryPolicy,
  StreamEvent,
  ToolCallPart,
  ToolResultPart,
  Usage,
} from '@harness/core';
import {
  assertNotAborted,
  BudgetExceededError,
  LoopExhaustedError,
  ToolError,
  ValidationError,
  withRetry,
} from '@harness/core';
import { HandoffSignal } from './handoff/handoff.ts';
import type {
  AgentEvent,
  ConversationStore,
  LoopHooks,
  RunContext,
  Tool,
  ToolContext,
} from './types.ts';

export interface LoopParams {
  provider: Provider;
  systemPrompt?: string | ((ctx: RunContext) => string) | undefined;
  tools: Tool[];
  memory?: ConversationStore | undefined;
  hooks: LoopHooks;
  bus?: EventBus | undefined;
  maxTurns: number;
  retryPolicy?: Partial<RetryPolicy> | undefined;
}

export interface LoopInput {
  conversationId: string;
  userMessage?: string | undefined;
  runId: string;
  signal: AbortSignal;
}

export async function* runLoop(
  params: LoopParams,
  input: LoopInput,
): AsyncGenerator<AgentEvent, void> {
  const { provider, tools, memory, hooks, bus, maxTurns, retryPolicy } = params;
  const { conversationId, userMessage, runId, signal } = input;

  const ctx: RunContext = { runId, conversationId, signal, bus };

  // 1. Load history
  let messages: Message[] = memory ? await memory.load(conversationId) : [];

  // 2. Resume from checkpoint
  if (hooks.loadCheckpoint) {
    const saved = await hooks.loadCheckpoint(runId);
    if (saved) {
      messages = saved.messages;
    }
  }

  // Prepend system prompt if absent
  const systemPrompt =
    typeof params.systemPrompt === 'function' ? params.systemPrompt(ctx) : params.systemPrompt;

  if (systemPrompt && (messages.length === 0 || messages[0]?.role !== 'system')) {
    messages = [{ role: 'system', content: systemPrompt }, ...messages];
  }

  // 3. Append user message
  if (userMessage) {
    const userMsg: Message = { role: 'user', content: userMessage };
    messages.push(userMsg);
    if (memory) {
      await memory.append(conversationId, [userMsg]);
    }
  }

  bus?.emit('run.start', {
    runId,
    conversationId,
    input: { conversationId, ...(userMessage != null ? { userMessage } : {}) },
  });

  const toolMap = new Map<string, Tool>();
  for (const t of tools) {
    if (toolMap.has(t.name)) {
      throw new ValidationError(`Duplicate tool name: "${t.name}"`, { zodIssues: null });
    }
    toolMap.set(t.name, t);
  }
  const toolSchemas = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  let totalUsage: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  for (let turn = 1; turn <= maxTurns; turn++) {
    assertNotAborted(signal);
    hooks.checkBudget?.();

    yield { type: 'turn-start', turn };
    bus?.emit('turn.start', { runId, turn });

    // Compaction hook
    if (hooks.compact) {
      messages = await hooks.compact(messages, { provider, runId, signal });
    }

    // Input guardrails hook
    if (hooks.runInputGuardrails) {
      messages = await hooks.runInputGuardrails(messages, ctx);
    }

    // Cache breakpoints hook
    if (hooks.insertCacheBreakpoints) {
      messages = hooks.insertCacheBreakpoints(messages, provider);
    }

    // Provider call
    bus?.emit('provider.call', {
      runId,
      providerId: provider.id,
      request: { messages, tools: toolSchemas },
    });

    const { text, toolCalls, turnUsage, streamEvents } = await collectProviderStream(
      provider,
      messages,
      toolSchemas,
      tools.length > 0,
      signal,
      retryPolicy,
      bus,
      runId,
      hooks,
    );

    for (const ev of streamEvents) {
      yield ev;
    }

    // Accumulate usage
    totalUsage = {
      inputTokens: (totalUsage.inputTokens ?? 0) + (turnUsage.inputTokens ?? 0),
      outputTokens: (totalUsage.outputTokens ?? 0) + (turnUsage.outputTokens ?? 0),
      totalTokens: (totalUsage.totalTokens ?? 0) + (turnUsage.totalTokens ?? 0),
    };

    bus?.emit('turn.finish', { runId, turn, usage: turnUsage });

    // No tool calls → finish
    if (toolCalls.length === 0) {
      let assistantMsg: Message = { role: 'assistant', content: text };

      if (hooks.runOutputGuardrails) {
        assistantMsg = await hooks.runOutputGuardrails(assistantMsg, ctx);
      }

      messages.push(assistantMsg);
      if (memory) {
        await memory.append(conversationId, [assistantMsg]);
      }

      if (hooks.saveCheckpoint) {
        await hooks.saveCheckpoint({ runId, conversationId, turn, messages });
        yield { type: 'checkpoint', runId, turn };
      }

      bus?.emit('run.finish', {
        runId,
        result: { finalMessage: text, turns: turn, usage: totalUsage },
      });
      return;
    }

    // Build assistant message with tool calls
    const assistantContent: MessagePart[] = [
      ...(text ? [{ type: 'text' as const, text }] : []),
      ...toolCalls,
    ];
    const assistantMsg: Message = { role: 'assistant', content: assistantContent };
    messages.push(assistantMsg);

    // Handle approvals in the generator so we can yield events
    const approvedCalls: { tc: ToolCallPart; args: unknown }[] = [];
    for (const tc of toolCalls) {
      const toolDef = toolMap.get(tc.toolName);
      if (toolDef && hooks.waitForApproval && needsApproval(toolDef, tc.args)) {
        const approvalId = crypto.randomUUID();
        yield { type: 'tool-approval-required', id: approvalId, name: tc.toolName, args: tc.args };
        bus?.emit('tool.approval', { runId, approvalId, toolName: tc.toolName, args: tc.args });

        if (hooks.saveCheckpoint) {
          await hooks.saveCheckpoint({
            runId,
            conversationId,
            turn,
            messages,
            pendingApprovals: [{ approvalId, toolName: tc.toolName, args: tc.args }],
          });
        }

        const decision = await hooks.waitForApproval(approvalId, tc.toolName, tc.args);
        if (!decision.approve) {
          const reason = 'reason' in decision ? decision.reason : 'Approval denied';
          const err = new ToolError(`Tool approval denied: ${reason}`, { toolName: tc.toolName });
          yield { type: 'tool-error', id: tc.toolCallId, error: err };
          bus?.emit('tool.error', { runId, toolName: tc.toolName, error: err });
          approvedCalls.push({ tc, args: '__DENIED__' });
          continue;
        }
        const args =
          'modifiedArgs' in decision && decision.modifiedArgs !== undefined
            ? decision.modifiedArgs
            : tc.args;
        approvedCalls.push({ tc, args });
      } else {
        approvedCalls.push({ tc, args: tc.args });
      }
    }

    // Execute approved tools in parallel, preserving original call order
    const approvedOnly = approvedCalls.filter((a) => a.args !== '__DENIED__');
    const { results: executedResults, events: toolEvents } = await executeToolCalls(
      approvedOnly.map((a) => ({ ...a.tc, args: a.args })),
      toolMap,
      { runId, conversationId, signal },
      bus,
    );

    const executedById = new Map(executedResults.map((r) => [r.toolCallId, r]));
    const toolResults: ToolResultPart[] = approvedCalls.map((a) => {
      if (a.args === '__DENIED__') {
        return errorResult(a.tc, 'Error: Tool approval denied');
      }
      return executedById.get(a.tc.toolCallId) ?? errorResult(a.tc, 'Error: Missing tool result');
    });

    for (const ev of toolEvents) {
      yield ev;
    }

    const toolResultMessages: Message[] = toolResults.map((r) => ({
      role: 'tool' as const,
      content: [r],
    }));
    messages.push(...toolResultMessages);

    if (memory) {
      await memory.append(conversationId, [assistantMsg, ...toolResultMessages]);
    }

    if (hooks.saveCheckpoint) {
      await hooks.saveCheckpoint({ runId, conversationId, turn, messages });
      yield { type: 'checkpoint', runId, turn };
    }
  }

  const err = new LoopExhaustedError(`Loop exhausted after ${maxTurns} turns`, { turns: maxTurns });
  bus?.emit('run.error', { runId, error: err });
  throw err;
}

export async function* runLoopWithBudgetEvents(
  params: LoopParams,
  input: LoopInput,
): AsyncGenerator<AgentEvent, void> {
  try {
    yield* runLoop(params, input);
  } catch (e) {
    if (e instanceof BudgetExceededError) {
      const { bus } = params;
      yield { type: 'budget.exceeded', kind: e.kind, spent: e.spent, limit: e.limit };
      bus?.emit('budget.exceeded', {
        runId: input.runId,
        kind: e.kind,
        spent: e.spent,
        limit: e.limit,
      });
    }
    throw e;
  }
}

// --- Helpers ---

interface ProviderStreamResult {
  text: string;
  toolCalls: ToolCallPart[];
  turnUsage: Usage;
  streamEvents: AgentEvent[];
}

async function collectProviderStream(
  provider: Provider,
  messages: Message[],
  toolSchemas: { name: string; description: string; parameters: unknown }[],
  hasTools: boolean,
  signal: AbortSignal,
  retryPolicy: Partial<RetryPolicy> | undefined,
  bus: EventBus | undefined,
  runId: string,
  hooks: LoopHooks,
): Promise<ProviderStreamResult> {
  const request: GenerateRequest = hasTools
    ? { messages, tools: toolSchemas as GenerateRequest['tools'] & {}, toolChoice: 'auto' }
    : { messages };

  const retryOpts = { signal, ...(bus ? { bus } : {}), runId };

  let stream: AsyncIterable<StreamEvent>;
  if (retryPolicy) {
    stream = await withRetry(async (s) => provider.stream(request, s), retryPolicy, retryOpts);
  } else {
    stream = provider.stream(request, signal);
  }

  let text = '';
  const toolCalls: ToolCallPart[] = [];
  let turnUsage: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const streamEvents: AgentEvent[] = [];

  for await (const event of stream) {
    assertNotAborted(signal);
    streamEvents.push(event);

    switch (event.type) {
      case 'text-delta':
        text += event.delta;
        break;
      case 'tool-call':
        toolCalls.push({
          type: 'tool-call',
          toolCallId: event.id,
          toolName: event.name,
          args: event.args,
        });
        break;
      case 'usage':
        turnUsage = event.tokens;
        hooks.updateBudget?.(event.tokens);
        if (bus) {
          const payload = {
            runId,
            tokens: event.tokens,
            ...(event.costUSD != null ? { costUSD: event.costUSD } : {}),
            ...(event.cacheReadTokens != null || event.cacheWriteTokens != null
              ? { cache: { read: event.cacheReadTokens ?? 0, write: event.cacheWriteTokens ?? 0 } }
              : {}),
          };
          bus.emit('provider.usage', payload);
        }
        break;
    }
  }

  return { text, toolCalls, turnUsage, streamEvents };
}

async function executeToolCalls(
  toolCalls: (ToolCallPart & { args: unknown })[],
  toolMap: Map<string, Tool>,
  ctx: ToolContext,
  bus?: EventBus,
): Promise<{ results: ToolResultPart[]; events: AgentEvent[] }> {
  const events: AgentEvent[] = [];
  const results: ToolResultPart[] = [];

  const settled = await Promise.allSettled(
    toolCalls.map((tc) => executeSingleTool(tc, toolMap, ctx, bus, events)),
  );

  for (const s of settled) {
    if (s.status === 'fulfilled') {
      results.push(s.value);
    }
    if (s.status === 'rejected' && s.reason instanceof HandoffSignal) {
      throw s.reason;
    }
  }

  return { results, events };
}

async function executeSingleTool(
  tc: ToolCallPart & { args: unknown },
  toolMap: Map<string, Tool>,
  ctx: ToolContext,
  bus: EventBus | undefined,
  events: AgentEvent[],
): Promise<ToolResultPart> {
  const start = Date.now();

  events.push({ type: 'tool-start', id: tc.toolCallId, name: tc.toolName, args: tc.args });
  bus?.emit('tool.start', { runId: ctx.runId, toolName: tc.toolName, args: tc.args });

  const toolDef = toolMap.get(tc.toolName);
  if (!toolDef) {
    const err = new ToolError(`Unknown tool: ${tc.toolName}`, { toolName: tc.toolName });
    events.push({ type: 'tool-error', id: tc.toolCallId, error: err });
    bus?.emit('tool.error', { runId: ctx.runId, toolName: tc.toolName, error: err });
    return errorResult(tc, `Error: Unknown tool "${tc.toolName}"`);
  }

  // Validate args
  const parseResult = toolDef.parameters.safeParse(tc.args);
  if (!parseResult.success) {
    const err = new ValidationError('Tool argument validation failed', {
      zodIssues: parseResult.error?.issues,
    });
    events.push({ type: 'tool-error', id: tc.toolCallId, error: err });
    bus?.emit('tool.error', { runId: ctx.runId, toolName: tc.toolName, error: err });
    const issuesSummary =
      parseResult.error?.issues
        ?.map(
          (i: { path?: unknown[]; message?: string }) =>
            `${(i.path ?? []).join('.')}: ${i.message ?? 'invalid'}`,
        )
        .join('; ') ?? 'invalid arguments';
    return errorResult(tc, `Validation error: ${issuesSummary}`);
  }

  try {
    const result = await toolDef.execute(parseResult.data as never, ctx);
    const durationMs = Date.now() - start;
    events.push({ type: 'tool-result', id: tc.toolCallId, result, durationMs });
    bus?.emit('tool.finish', { runId: ctx.runId, toolName: tc.toolName, result, durationMs });
    return {
      type: 'tool-result',
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      result: typeof result === 'string' ? result : JSON.stringify(result),
    };
  } catch (e) {
    if (e instanceof HandoffSignal) {
      throw e;
    }
    const err =
      e instanceof ToolError
        ? e
        : new ToolError(e instanceof Error ? e.message : String(e), {
            toolName: tc.toolName,
            cause: e,
          });
    events.push({ type: 'tool-error', id: tc.toolCallId, error: err });
    bus?.emit('tool.error', { runId: ctx.runId, toolName: tc.toolName, error: err });
    return errorResult(tc, `Error: ${err.message}`);
  }
}

function errorResult(tc: ToolCallPart, message: string): ToolResultPart {
  return {
    type: 'tool-result',
    toolCallId: tc.toolCallId,
    toolName: tc.toolName,
    result: message,
    isError: true,
  };
}

function needsApproval(tool: Tool, args: unknown): boolean {
  if (!tool.requireApproval || tool.requireApproval === 'never') {
    return false;
  }
  if (tool.requireApproval === 'always') {
    return true;
  }
  return tool.requireApproval(args);
}
