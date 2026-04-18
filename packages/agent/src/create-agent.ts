import type { RunInput, RunResult, Usage } from '@harness/core';
import { createApprovalRegistry } from './approval.ts';
import { createBudgetTracker } from './budgets/tracker.ts';
import { insertCacheBreakpoints } from './cache.ts';
import { runInputHooks, runOutputHooks } from './guardrails/hooks.ts';
import { runLoopWithBudgetEvents } from './loop.ts';
import type { Agent, AgentConfig, AgentEvent, LoopHooks, RunOptions } from './types.ts';

const DEFAULT_MAX_TURNS = 10;

export function createAgent(cfg: AgentConfig): Agent {
  const hooks: LoopHooks = {};

  // 2b: compaction
  if (cfg.compactor) {
    const compactor = cfg.compactor;
    hooks.compact = (messages, ctx) => compactor.compact(messages, ctx);
  }

  // 2b: cache breakpoints
  hooks.insertCacheBreakpoints = insertCacheBreakpoints;

  // 2d: approval (HITL)
  const hasApprovalTools = cfg.tools?.some(
    (t) => t.requireApproval && t.requireApproval !== 'never',
  );
  let approvalRegistry: ReturnType<typeof createApprovalRegistry> | undefined;
  if (hasApprovalTools) {
    approvalRegistry = createApprovalRegistry();
    hooks.waitForApproval = approvalRegistry.waitForApproval;
  }

  // 2d: checkpointer
  if (cfg.checkpointer) {
    const cp = cfg.checkpointer;
    hooks.saveCheckpoint = (state) => cp.save(state.runId, state);
    hooks.loadCheckpoint = (runId) => cp.load(runId);
  }

  // 2e: guardrails
  if (cfg.guardrails?.input?.length) {
    const inputGuardrails = cfg.guardrails.input;
    hooks.runInputGuardrails = (messages, ctx) =>
      runInputHooks(inputGuardrails, messages, ctx, cfg.events);
  }
  if (cfg.guardrails?.output?.length) {
    const outputGuardrails = cfg.guardrails.output;
    hooks.runOutputGuardrails = (message, ctx) =>
      runOutputHooks(outputGuardrails, message, ctx, cfg.events);
  }

  // 2c: budgets
  if (cfg.budgets) {
    const tracker = createBudgetTracker(cfg.budgets, cfg.events);
    hooks.checkBudget = () => tracker.check();
    hooks.updateBudget = (usage) => {
      tracker.update(usage);
      tracker.check();
    };
  }

  async function* stream(input: RunInput, opts?: RunOptions): AsyncGenerator<AgentEvent, void> {
    const conversationId = input.conversationId ?? crypto.randomUUID();
    const runId = opts?.runId ?? crypto.randomUUID();
    const signal = opts?.signal ?? new AbortController().signal;

    yield* runLoopWithBudgetEvents(
      {
        provider: cfg.provider,
        systemPrompt: cfg.systemPrompt,
        tools: cfg.tools ?? [],
        memory: cfg.memory,
        hooks,
        bus: cfg.events,
        maxTurns: cfg.maxTurns ?? DEFAULT_MAX_TURNS,
        retryPolicy: cfg.retryPolicy,
      },
      { conversationId, userMessage: input.userMessage, runId, signal },
    );
  }

  async function run(input: RunInput, opts?: RunOptions): Promise<RunResult> {
    let finalMessage: unknown;
    let turns = 0;
    let totalUsage: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

    for await (const event of stream(input, opts)) {
      switch (event.type) {
        case 'turn-start':
          turns = event.turn;
          break;
        case 'text-delta':
          if (typeof finalMessage === 'string') {
            finalMessage += event.delta;
          } else {
            finalMessage = event.delta;
          }
          break;
        case 'usage':
          totalUsage = {
            inputTokens: (totalUsage.inputTokens ?? 0) + (event.tokens.inputTokens ?? 0),
            outputTokens: (totalUsage.outputTokens ?? 0) + (event.tokens.outputTokens ?? 0),
            totalTokens: (totalUsage.totalTokens ?? 0) + (event.tokens.totalTokens ?? 0),
          };
          break;
      }
    }

    return { finalMessage, turns, usage: totalUsage };
  }

  return { run, stream };
}
