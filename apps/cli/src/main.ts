import { composeHarness } from '@harness/bootstrap';
import { startRun } from '@harness/core';
import { createCapabilityRegistry } from '@harness/mastra/capabilities';

const message = process.argv[2];
if (!message) {
  console.error('Usage: bun run start "your message"');
  process.exit(1);
}

const { deps, shutdown } = composeHarness({
  capabilityRegistry: createCapabilityRegistry(),
  logLevel: 'error',
});
const controller = new AbortController();

deps.runAbortControllers.set('cli', controller);

const { runId } = await startRun(
  deps,
  { capabilityId: 'simple-chat', input: { message }, settings: {} },
  controller.signal,
);

const events = deps.eventBus.subscribe(runId);
for await (const event of events) {
  console.log(JSON.stringify(event));
  if (
    event.type === 'run.completed' ||
    event.type === 'run.failed' ||
    event.type === 'run.cancelled'
  ) {
    break;
  }
}

await shutdown();
