# Code Review: `apps/deep-research`

**Date:** 2026-04-19
**Scope:** Full codebase — 20 source files, 14 test files, 2 evals
**Verdict:** Request Changes — 3 Critical, 5 Important, 7 Suggestions

---

## 1. Correctness

### Critical: Researcher sub-agent receives no tools in default flow

**`src/index.ts:139-147`** — `createResearchGraph` is called without passing any `tools`. The `tools` param defaults to `[]`. The researcher sub-agent's system prompt says "Use the fetch tool to search the web" but it has zero tools available. `createSearchTools()` from `src/tools/search.ts` is never called anywhere in the CLI entry point.

**Impact:** In the default CLI flow, the researcher can't actually search the web — it hallucinates findings with no tool access.

**Fix:**

```typescript
// index.ts — before createResearchGraph()
const tools = await createSearchTools({
  braveApiKey: config.BRAVE_API_KEY,
  signal: streamAc.signal,
});

const agent = createResearchGraph({
  provider,
  tools,          // <-- pass search tools
  depth,
  skipApproval,
  checkpointer,
  store,
  budgets,
  events: bus,
});
```

---

### Critical: Writer structured output is discarded

**`src/index.ts:219-229`** — The writer agent is prompted to return structured JSON (`{ title, sections[], references[] }`), but `index.ts` ignores it entirely. It wraps `summary.text` (raw streamed text) into a single-section `Report` with hardcoded heading `"Research"` and empty `references: []`.

All citation URLs and structured sections from the writer are thrown away.

**Fix:** Parse the writer's structured output in `writeNode` (graph.ts) and propagate it, or parse it in `index.ts`:

```typescript
// In index.ts, after stream completes:
let report: Report;
try {
  report = Report.parse(JSON.parse(summary.text));
} catch {
  report = {
    title: question,
    sections: [{ heading: 'Research', body: summary.text }],
    references: [],
  };
}
```

---

### Critical: Fact-checker has no access to source material

**`src/graph.ts:107-129`** — The fact-checker agent receives only the report text. It has no tools, no access to the original research findings, source URLs, or the ability to fetch URLs to verify claims. It's an LLM asked to "verify citations" with zero verification capability — it can only guess.

**Fix:** Either:
1. Pass the findings (including source URLs) as context to the fact-checker prompt
2. Give the fact-checker a fetch tool so it can actually check URLs
3. Wire in the existing `citationCheckHook` (which is defined, tested, but never used)

```typescript
// graph.ts — factCheckNode
const checker = createFactCheckerAgent(provider, {
  // ...existing opts,
  tools: [fetchTool({ allow: [HTTPS_ONLY] })],  // option 2
});

const findings = state.findings as Finding[];
const sourceContext = findings
  .map(f => `[${f.subquestionId}] Sources: ${f.sourceUrls.join(', ')}`)
  .join('\n');

const result = await checker.run({
  userMessage: `Research sources:\n${sourceContext}\n\nVerify citations in this report:\n\n${state.reportText}`,
}, { signal: ctx.signal });
```

---

### Important: Budget CLI parsing doesn't validate NaN

**`src/index.ts:91-94`** — `Number(values['budget-usd'])` on a non-numeric string (e.g. `--budget-usd abc`) produces `NaN`, which silently propagates through `splitBudget` and into every sub-agent's budget config. No validation.

**Fix:**

```typescript
const budgetUsd = values['budget-usd'] ? Number(values['budget-usd']) : config.BUDGET_USD;
if (Number.isNaN(budgetUsd)) {
  console.error(pc.red('Error: --budget-usd must be a number'));
  process.exit(1);
}
// Same for budgetTokens
```

---

### Important: Planner has no retry on JSON parse failure

**`src/agents/planner.ts:56-57`** — If the LLM returns malformed JSON (common), `extractJson` throws and the entire pipeline fails. No retry, no fallback.

**Fix:** Add a retry loop (1-2 attempts) with a more explicit prompt on retry:

```typescript
for (let attempt = 0; attempt < 3; attempt++) {
  const result = await provider.generate(/* ... */);
  try {
    const parsed = extractJson(text);
    return { ...state, plan: ResearchPlan.parse(parsed) };
  } catch (err) {
    if (attempt === 2) throw err;
    // Optionally append "Previous response was invalid JSON. Respond with valid JSON only."
  }
}
```

---

### Important: `citationCheckHook` defined but never wired

**`src/guardrails/citation-check.ts`** — Well-implemented and thoroughly tested output hook that catches hallucinated URLs. But it's never used in any agent or graph node. Dead guardrail.

**Fix:** Wire it into the writer agent as an output hook, or use it in the fact-check node as a programmatic pre-check.

---

## 2. Readability & Simplicity

### Suggestion: Untyped graph state forces `as` casts everywhere

**`src/graph.ts` lines 54, 91, 115, 123, 146** — Every node does `state.plan as ResearchPlan`, `state.findings as Finding[]`, etc. This is fragile — a typo in the property name compiles fine but blows up at runtime.

**Fix:** Define a typed state interface:

```typescript
interface ResearchState {
  userMessage: string;
  plan?: ResearchPlan;
  approved?: boolean;
  findings?: Finding[];
  reportText?: string;
  factCheckPassed?: boolean;
  factCheckRetries?: number;
}
```

---

### Suggestion: Deprecated `createResearchAgent` is dead code

**`src/agents/researcher.ts:36-48`** — Marked `@deprecated`, not imported anywhere, not used in tests. Should be deleted.

---

### Suggestion: `streamAc` mutation pattern in `index.ts` is confusing

**`src/index.ts:149-158, 203`** — `streamAc` is `let`, gets nulled in the SIGINT handler, recreated after approval, and checked with `?.`. The control flow around abort + resume + re-create is hard to follow.

**Fix:** Encapsulate in a small helper:

```typescript
function createAbortable() {
  let ac = new AbortController();
  return {
    get signal() { return ac.signal; },
    abort() { ac.abort(); },
    reset() { ac = new AbortController(); },
  };
}
```

---

## 3. Architecture

### Important: `createSearchTools` is orphaned from the main flow

**`src/tools/search.ts`** — This module correctly builds fetch + optional Brave MCP tools. It's tested. But the CLI entry point (`index.ts`) never calls it. The graph receives `tools: []` by default.

This is a wiring gap — the tool factory exists but isn't connected. See Correctness critical #1 above.

---

### Suggestion: Module-level side effect in `provider.ts`

**`src/provider.ts:5`** — `createOpenRouter({ apiKey: config.OPENROUTER_API_KEY })` executes at import time. Any test that imports `provider.ts` (even transitively) requires `OPENROUTER_API_KEY` to be set.

**Fix:** Move into `createProvider`:

```typescript
export function createProvider(modelId?: string) {
  const openrouter = createOpenRouter({ apiKey: config.OPENROUTER_API_KEY });
  const model = openrouter.chat(modelId ?? config.MODEL_ID);
  return aiSdkProvider(model);
}
```

---

### Suggestion: `writeReport` signature is async but body is sync

**`src/report/write.ts:24-37`** — Returns `Promise<string>` but uses `writeFileSync`/`renameSync`. Either make it truly async (`fs.promises`) or drop the async.

---

## 4. Security

### Important: Deprecated researcher allows all URL schemes

**`src/agents/researcher.ts:42`** — `fetchTool({ allow: [/.*/] })` matches any URL including `file:///etc/passwd`, `http://169.254.169.254` (cloud metadata), and private IPs. While deprecated, it's still exported and could be used accidentally.

**Fix:** Delete the deprecated function, or at minimum restrict to HTTPS:

```typescript
fetchTool({ allow: [/^https:\/\//] })
```

---

### Suggestion: `npx -y` auto-installs in MCP tool loading

**`src/tools/mcp.ts:14`** — `npx -y @anthropic/brave-search-mcp` auto-approves package installation. In CI or production, this is a supply-chain vector. An attacker who compromises the npm package gets code execution.

**Fix:** Pin the package version and consider using a pre-installed binary:

```typescript
args: ['-y', '@anthropic/brave-search-mcp@1.2.3'],
```

Or better: add it to `devDependencies` and run the installed binary directly.

---

### Suggestion: No prompt injection mitigation

**`src/index.ts:78`** — The user's question is interpolated directly into LLM prompts (`Question: ${question}`). While this is expected for a research tool, adversarial input could manipulate the planner/researcher behavior.

**Mitigation (low priority for CLI tool):** Wrap user input in delimiters:

```
<user_question>${question}</user_question>
```

---

## 5. Performance

### Important: Sequential subquestion research

**`src/graph.ts:67-77`** — Each subquestion is researched serially in a `for...of` loop. With `depth=deep` (8 subquestions), that's 8 serial LLM calls + web fetches. These are independent and embarrassingly parallel.

**Fix:**

```typescript
const findings = await Promise.all(
  plan.subquestions.map(async (sq) => {
    const result = await researcherTool.execute(
      { input: `[${sq.id}] ${sq.question}` },
      toolCtx,
    );
    try {
      return FindingSchema.parse(JSON.parse(result as string));
    } catch {
      return { subquestionId: sq.id, summary: result as string, sourceUrls: [] };
    }
  }),
);
```

Add a concurrency limit if budget tracking needs serialization:

```typescript
import pLimit from 'p-limit';
const limit = pLimit(3);
const findings = await Promise.all(
  plan.subquestions.map(sq => limit(() => /* ... */)),
);
```

---

## Test Coverage Assessment

**Strong areas:**
- Schema validation (plan, report, finding) — good edge cases
- Budget splitting — all ratio combinations
- Slug generation — truncation, edge cases
- Citation check hook — pass/block/empty scenarios
- Graph happy path, retry, HITL interrupt/resume
- Integration tests cover the full pipeline

**Gaps:**
- No test for NaN budget propagation
- No test that verifies tools are actually passed to the researcher
- No negative test for `writeReport` failure modes (disk full, permission denied)
- `createDeepResearchRenderer` has zero tests (UI rendering)
- `index.ts` CLI arg parsing has no tests (though it's thin enough to skip)
- No test that the `citationCheckHook` is wired into the pipeline (because it isn't)

---

## Summary Table

| # | Severity | Axis | Location | Issue |
|---|----------|------|----------|-------|
| 1 | **Critical** | Correctness | `index.ts:139` | Researcher gets no search tools |
| 2 | **Critical** | Correctness | `index.ts:222` | Writer structured output discarded |
| 3 | **Critical** | Correctness | `graph.ts:107` | Fact-checker can't verify anything |
| 4 | **Important** | Correctness | `index.ts:91` | NaN budget propagation |
| 5 | **Important** | Correctness | `planner.ts:56` | No retry on JSON parse failure |
| 6 | **Important** | Correctness | `citation-check.ts` | Guardrail defined but never used |
| 7 | **Important** | Architecture | `tools/search.ts` | Search tools factory orphaned |
| 8 | **Important** | Security | `researcher.ts:42` | Deprecated agent allows all URLs |
| 9 | **Important** | Performance | `graph.ts:67` | Sequential subquestion research |
| 10 | Suggestion | Readability | `graph.ts` | Untyped graph state, `as` casts |
| 11 | Suggestion | Readability | `researcher.ts:36` | Dead deprecated export |
| 12 | Suggestion | Readability | `index.ts:149` | Confusing `streamAc` mutation |
| 13 | Suggestion | Architecture | `provider.ts:5` | Module-level side effect |
| 14 | Suggestion | Architecture | `report/write.ts:24` | Async signature, sync body |
| 15 | Suggestion | Security | `mcp.ts:14` | `npx -y` auto-install risk |
| 16 | Suggestion | Security | `index.ts:78` | No prompt injection mitigation |

---

## Improvement Plan

### Phase 1: Fix Critical Bugs (blocking)

1. **Wire search tools into CLI flow** — Call `createSearchTools()` in `index.ts` and pass results to `createResearchGraph`. This is the highest-impact fix: without it, the researcher literally cannot research.

2. **Parse writer structured output** — Either parse the writer's JSON response in `writeNode` and store structured `Report` in state, or parse it in `index.ts`. Stop wrapping raw text into a fake single-section report.

3. **Give fact-checker verification capability** — Pass research findings as context to the fact-checker prompt. Optionally give it a fetch tool. Wire in `citationCheckHook` as a programmatic pre-check before the LLM-based check.

### Phase 2: Important Fixes (before next release)

4. **Validate CLI budget args** — Guard against `NaN` from `Number()` parsing.

5. **Add planner retry logic** — Retry 1-2 times on JSON parse failure with a stricter re-prompt.

6. **Parallelize subquestion research** — Use `Promise.all` (optionally with concurrency limit) in `researchNode`.

7. **Delete deprecated `createResearchAgent`** — It's unused, untested in the real flow, and has a security issue (allows all URL schemes).

### Phase 3: Cleanup (next sprint)

8. **Type the graph state** — Define `ResearchState` interface, eliminate all `as` casts.

9. **Move OpenRouter init inside `createProvider`** — Remove module-level side effect.

10. **Pin MCP package version** — Replace `npx -y @anthropic/brave-search-mcp` with a pinned version or pre-installed dep.

11. **Make `writeReport` truly async or drop the Promise** — Use `fs.promises` or make it sync.

12. **Add missing tests** — UI renderer, NaN budget, tool wiring verification.
