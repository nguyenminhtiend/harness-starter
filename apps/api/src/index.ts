import { compose } from './compose.ts';
import { loadConfig } from './config.ts';

const config = loadConfig();
const { app, shutdown } = compose(config);

const server = Bun.serve({
  port: config.port,
  hostname: config.host,
  fetch: app.fetch,
});

console.log(`API server listening on http://${server.hostname}:${server.port}`);

process.on('SIGTERM', async () => {
  await shutdown();
  server.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await shutdown();
  server.stop();
  process.exit(0);
});
