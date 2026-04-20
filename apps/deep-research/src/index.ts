import * as path from 'node:path';
import { parseArgs } from 'node:util';
import {
  type Agent,
  type Checkpointer,
  createStreamRenderer,
  type RunState,
  type StreamRenderer,
  type StreamSummary,
} from '@harness/agent';
import { BudgetExceededError, createEventBus, type EventBus, type Usage } from '@harness/core';
import { consoleSink, jsonlSink } from '@harness/observability';
import { promptApproval } from '@harness/tui/approval';
import { setupSigint } from '@harness/tui/sigint';
import { formatUsage } from '@harness/tui/usage';
import pc from 'picocolors';
import { splitBudget } from './budgets.ts';
import { type Config, config } from './config.ts';
import { createResearchGraph } from './graph.ts';
import { createPersistence, type PersistenceResult } from './persistence.ts';
import { createProvider } from './provider.ts';
import { slugify } from './report/slug.ts';
import { writeReport } from './report/write.ts';
import type { ResearchPlan } from './schemas/plan.ts';
import type { Report } from './schemas/report.ts';
import { createSearchTools } from './tools/search.ts';
import { createDeepResearchRenderer } from './ui/render.ts';

function readPlanFromCheckpoint(saved: RunState | null): ResearchPlan | undefined {
  const savedState = saved?.graphState as { data: Record<string, unknown> } | undefined;
  return savedState?.data?.plan as ResearchPlan | undefined;
}

function readReportFromCheckpoint(saved: RunState | null): Report | undefined {
  const savedState = saved?.graphState as { data: Record<string, unknown> } | undefined;
  return savedState?.data?.report as Report | undefined;
}

interface AbortHandle {
  current: AbortController | null;
  abort(): void;
  reset(): void;
}

function createAbortHandle(): AbortHandle {
  const handle: AbortHandle = {
    current: new AbortController(),
    abort() {
      handle.current?.abort();
      handle.current = null;
    },
    reset() {
      handle.current = new AbortController();
    },
  };
  return handle;
}

async function setupObservability(
  bus: EventBus,
  cfg: Config,
  outDir: string,
  noFile: boolean,
  slug: string,
): Promise<(() => void)[]> {
  const sinkTeardowns: (() => void)[] = [];
  sinkTeardowns.push(consoleSink(bus, { level: 'silent' }));

  if (!noFile) {
    const eventsPath = path.join(outDir, `${slug}-${Date.now()}.events.jsonl`);
    sinkTeardowns.push(jsonlSink(bus, { path: eventsPath }));
  }

  if (cfg.LANGFUSE_PUBLIC_KEY) {
    try {
      const { langfuseAdapter } = await import('@harness/observability');
      const langfuseMod = await import('langfuse' as string);
      const LangfuseCtor = langfuseMod.Langfuse ?? langfuseMod.default;
      const client = new LangfuseCtor({
        publicKey: cfg.LANGFUSE_PUBLIC_KEY,
        secretKey: cfg.LANGFUSE_SECRET_KEY ?? '',
        ...(cfg.LANGFUSE_BASE_URL ? { baseUrl: cfg.LANGFUSE_BASE_URL } : {}),
      });
      sinkTeardowns.push(langfuseAdapter(bus, client));
      console.log(pc.dim('Langfuse tracing enabled'));
    } catch {
      console.warn(pc.yellow('Langfuse requested but langfuse package not available'));
    }
  }

  return sinkTeardowns;
}

async function runResearchLoop(
  agent: Agent,
  renderer: StreamRenderer,
  question: string,
  checkpointer: Checkpointer,
  runId: string,
  streamAc: AbortHandle,
  skipApproval: boolean,
): Promise<StreamSummary> {
  process.stdout.write(pc.dim('📋 planning…\n'));

  let summary = await renderer.render(
    agent.stream(
      { userMessage: question },
      { ...(streamAc.current && { signal: streamAc.current.signal }), runId },
    ),
  );

  if (summary.text.trim() || skipApproval) {
    return summary;
  }

  const checkpoint = await checkpointer.load(runId);
  const plan = readPlanFromCheckpoint(checkpoint);
  if (!plan) {
    return summary;
  }

  console.log(pc.bold('\nResearch Plan:\n'));
  for (const sq of plan.subquestions) {
    console.log(`  ${pc.cyan(sq.id)} ${sq.question}`);
    for (const q of sq.searchQueries) {
      console.log(`     ${pc.dim(q)}`);
    }
  }
  console.log('');

  const answer = await promptApproval('Approve plan?', {
    choices: ['y', 'n'],
    defaultChoice: 'n',
  });

  if (answer.toLowerCase() !== 'y') {
    console.log(pc.yellow('\nPlan rejected.'));
    process.exit(2);
  }

  if (checkpoint?.graphState) {
    (checkpoint.graphState as { data: Record<string, unknown> }).data.approved = true;
    await checkpointer.save(runId, checkpoint);
  }

  streamAc.reset();
  process.stdout.write(pc.dim('\n🔎 researching…\n'));

  summary = await renderer.render(
    agent.stream(
      { userMessage: question },
      { ...(streamAc.current && { signal: streamAc.current.signal }), runId },
    ),
  );
  return summary;
}

async function persistReport(report: Report, outDir: string, slug: string): Promise<string> {
  return writeReport(report, outDir, slug);
}

function shutdown(sinkTeardowns: (() => void)[], persistence: PersistenceResult): void {
  for (const teardown of sinkTeardowns) {
    teardown();
  }
  persistence.close();
}

const HELP = `
${pc.bold('deep-research')} — local-first deep research CLI

${pc.bold('Usage:')}
  deep-research "<question>"

${pc.bold('Flags:')}
  --depth <shallow|medium|deep>  Number of subquestions (3/5/8)    [default: medium]
  --out <dir>                    Output directory for reports       [default: ./reports]
  --no-file                      Stdout only, skip file write
  --no-approval                  Skip HITL plan approval
  --ephemeral                    Use in-memory store (no sqlite)
  --budget-usd <n>               Hard dollar ceiling                [default: 0.50]
  --budget-tokens <n>            Hard token ceiling                 [default: 200000]
  --model <id>                   Override the model ID
  --resume <id>                  Resume a checkpointed run
  --help                         Show this help message
  --version                      Show version

${pc.bold('Exit codes:')}
  0   Success
  1   Budget exceeded
  2   User aborted plan
  3   Fact-check failed after retries
  130 SIGINT
`.trim();

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    depth: { type: 'string', default: 'medium' },
    out: { type: 'string' },
    'no-file': { type: 'boolean', default: false },
    'no-approval': { type: 'boolean', default: false },
    ephemeral: { type: 'boolean', default: false },
    'budget-usd': { type: 'string' },
    'budget-tokens': { type: 'string' },
    model: { type: 'string' },
    resume: { type: 'string' },
    help: { type: 'boolean', default: false },
    version: { type: 'boolean', default: false },
  },
  allowPositionals: true,
  strict: true,
});

if (values.help) {
  console.log(HELP);
  process.exit(0);
}

if (values.version) {
  console.log('0.0.0');
  process.exit(0);
}

const question = positionals[0];

if (!question?.trim()) {
  console.error(pc.red('Error: a question is required.'));
  console.error(`\nRun ${pc.cyan('deep-research --help')} for usage.\n`);
  process.exit(1);
}

const outDir = values.out ?? config.REPORT_DIR;
const noFile = values['no-file'] ?? false;
const skipApproval = values['no-approval'] ?? false;
const depth = values.depth ?? 'medium';
const modelId = values.model;
const budgetUsd = values['budget-usd'] ? Number(values['budget-usd']) : config.BUDGET_USD;
if (Number.isNaN(budgetUsd)) {
  console.error(pc.red('Error: --budget-usd must be a number'));
  process.exit(1);
}
const budgetTokens = values['budget-tokens']
  ? Number(values['budget-tokens'])
  : config.BUDGET_TOKENS;
if (Number.isNaN(budgetTokens)) {
  console.error(pc.red('Error: --budget-tokens must be a number'));
  process.exit(1);
}
const budgets = splitBudget({ usd: budgetUsd, tokens: budgetTokens });

const provider = createProvider(modelId);
const ephemeral = values.ephemeral ?? false;
const persistence = await createPersistence({
  ephemeral,
  dataDir: config.DATA_DIR,
});
const { store, checkpointer } = persistence;
const runId = values.resume ?? crypto.randomUUID();

if (persistence.type === 'sqlite') {
  console.log(pc.dim(`Using sqlite storage (${config.DATA_DIR})`));
}

const slug = slugify(question);
const bus = createEventBus();
const sinkTeardowns = await setupObservability(bus, config, outDir, noFile, slug);

const streamAc = createAbortHandle();

const tools = await createSearchTools({
  ...(config.BRAVE_API_KEY ? { braveApiKey: config.BRAVE_API_KEY } : {}),
  ...(streamAc.current ? { signal: streamAc.current.signal } : {}),
});

const agent = createResearchGraph({
  provider,
  tools,
  depth,
  skipApproval,
  checkpointer,
  store,
  budgets,
  events: bus,
});

setupSigint({
  isStreaming: () => streamAc.current !== null,
  onAbort: () => streamAc.abort(),
  onExit: () => process.exit(130),
});

console.log(pc.bold(`\ndeep-research · "${question}"\n`));

const rendererCallbacks = createDeepResearchRenderer();
const renderer = createStreamRenderer(rendererCallbacks);

// Bridge EventBus events to renderer — graph fn nodes don't yield AgentEvents,
// but inner agents DO emit to the bus, so we forward them for UI feedback.
let busUsage: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
const busTeardowns: (() => void)[] = [];
busTeardowns.push(bus.on('handoff', (p) => rendererCallbacks.onHandoff?.(p.from, p.to)));
busTeardowns.push(
  bus.on('tool.start', (p) => rendererCallbacks.onToolStart?.(p.runId, p.toolName, p.args)),
);
busTeardowns.push(
  bus.on('tool.finish', (p) => rendererCallbacks.onToolResult?.(p.runId, p.result, p.durationMs)),
);
busTeardowns.push(
  bus.on('provider.usage', (p) => {
    busUsage = {
      inputTokens: (busUsage.inputTokens ?? 0) + (p.tokens.inputTokens ?? 0),
      outputTokens: (busUsage.outputTokens ?? 0) + (p.tokens.outputTokens ?? 0),
      totalTokens: (busUsage.totalTokens ?? 0) + (p.tokens.totalTokens ?? 0),
    };
  }),
);

try {
  const summary = await runResearchLoop(
    agent,
    renderer,
    question,
    checkpointer,
    runId,
    streamAc,
    skipApproval,
  );

  const totalTokens = (summary.usage.totalTokens ?? 0) || (busUsage.totalTokens ?? 0);
  const footer = formatUsage({ totalTokens, durationMs: summary.durationMs });

  process.stdout.write('\n');

  const finalCheckpoint = await checkpointer.load(runId);
  const report = readReportFromCheckpoint(finalCheckpoint);

  if (!noFile && report) {
    const filePath = await persistReport(report, outDir, slug);
    console.log(pc.green(`✅ report saved → ${filePath}`));
  } else if (!noFile && summary.text.trim()) {
    const fallbackReport: Report = {
      title: question,
      sections: [{ heading: 'Research', body: summary.text }],
      references: [],
    };
    const filePath = await persistReport(fallbackReport, outDir, slug);
    console.log(pc.green(`✅ report saved → ${filePath}`));
  }

  console.log(pc.dim(footer));
  for (const unsub of busTeardowns) {
    unsub();
  }
  shutdown(sinkTeardowns, persistence);
  process.exit(0);
} catch (err) {
  for (const unsub of busTeardowns) {
    unsub();
  }
  shutdown(sinkTeardowns, persistence);
  if ((err as Error).name === 'AbortError') {
    console.error(`\n${pc.dim('(cancelled)')}`);
    process.exit(130);
  }
  if (err instanceof BudgetExceededError) {
    console.error(`\n${pc.yellow('[budget exceeded]')} ${err.message}`);
    process.exit(1);
  }
  console.error(`\n${pc.red('[error]')} ${(err as Error).message ?? err}`);
  process.exit(1);
}
