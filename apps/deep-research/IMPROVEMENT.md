# Improvements Needed

## 1. `plan!` non-null assertion in `researchNode` (biome violation)

`apps/deep-research/src/graph.ts` lines 69-69

```typescript
const plan = s.plan!;
```

This violates the repo's "no `!` non-null assertions" rule. Should guard:

```typescript
if (!s.plan) {
  throw new Error('research node reached without a plan');
}
const plan = s.plan;
```

## 2. `streamAc.current!` non-null assertion in `runResearchLoop`

`apps/deep-research/src/index.ts` lines 150-150

```typescript
agent.stream({ userMessage: question }, { signal: streamAc.current!.signal, runId }),
```

Same issue. Guard with an `if` or `assert` after `streamAc.reset()` guarantees it's set.

## 3. `citationCheckHook` is defined but never wired

The `citation-check.ts` guardrail defines an `OutputHook` but the graph uses an ad-hoc URL diff in `factCheckNode` instead. Either:
- Wire `citationCheckHook` as an actual output hook on the writer agent, or
- Remove the dead hook and keep the inline approach (it's more comprehensive since it has retry semantics)

## 4. Parallel research has no concurrency limit

`apps/deep-research/src/graph.ts` lines 81-81

```typescript
const findings = await Promise.all(
```

At `depth=deep` that's 8 concurrent subagent runs, each hitting the LLM + fetching URLs. Should use a bounded concurrency pool (e.g., `p-limit` or a simple semaphore) to avoid rate-limit blowups and budget overshoot.

## 5. Budget isn't enforced on the planner

`splitBudget` carves 10% for the planner, but `createPlannerNode` uses raw `provider.generate()` — no budgets option is passed. The planner can overspend with zero enforcement.

## 6. `readPlanFromCheckpoint` / `readReportFromCheckpoint` use unsafe casts

`apps/deep-research/src/index.ts` lines 30-33

```typescript
function readPlanFromCheckpoint(saved: RunState | null): ResearchPlan | undefined {
  const savedState = saved?.graphState as { data: Record<string, unknown> } | undefined;
  return savedState?.data?.plan as ResearchPlan | undefined;
}
```

These blind `as` casts on checkpoint data are fragile. Should validate with the Zod schemas or at least do structural checks — a corrupt checkpoint silently returns `undefined` and the run continues without a plan.

## 7. No retry/backoff on `provider.generate()` in planner

The planner retries on JSON parse failures but not on transient provider errors (429, 500, network). Since the harness principle is "retries wrap provider calls only," the planner should wrap `provider.generate()` with a retry for transient failures.

## 8. Writer/fact-checker `maxTurns: 3` is low with no structured output

Both agents ask for JSON output via system prompt but don't use `responseFormat` for actual structured output enforcement. With `maxTurns: 3`, if the model outputs markdown on the first turn there's very little room for the retry → re-prompt cycle. Either use `responseFormat` with Zod schema, or bump `maxTurns`.

## 9. `console.warn` in `persistence.ts` (biome rule: no `console` in packages)

This file is in `apps/` so it's technically allowed, but it inconsistently uses `console.warn` in the catch block while the rest of the app uses `pc.yellow()` for warnings. Minor, but worth aligning.

## 10. Single-provider architecture

All four agents share one provider/model. The planner and fact-checker don't need a frontier model — a cheaper/faster model would reduce cost and latency. The `createResearchGraph` opts could accept a `providers: { planner?, researcher?, writer?, factChecker? }` map.

## 11. No `AbortSignal` forwarded to researcher tool creation per-run

The `createSearchTools` call in `index.ts` captures the signal at startup, but the `researchNode` creates a new `researcherTool` on each invocation without forwarding the current `ctx.signal`. If the user hits Ctrl+C during research, in-flight fetch calls inside MCP tools won't be cancelled.