const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function createLineWriter(tag: string, color: string): WritableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let buffer = '';

  return new WritableStream({
    write(chunk) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim().length > 0) {
          process.stdout.write(`${color}[${tag}]${RESET} ${line}\n`);
        }
      }
    },
    close() {
      if (buffer.trim().length > 0) {
        process.stdout.write(`${color}[${tag}]${RESET} ${buffer}\n`);
      }
    },
  });
}

const server = Bun.spawn(['bun', '--hot', 'src/server/index.ts'], {
  cwd: process.cwd(),
  stdout: 'pipe',
  stderr: 'pipe',
});

const ui = Bun.spawn(['bunx', 'vite'], {
  cwd: process.cwd(),
  stdout: 'pipe',
  stderr: 'pipe',
});

if (server.stdout) {
  void server.stdout.pipeTo(createLineWriter('server', CYAN));
}
if (server.stderr) {
  void server.stderr.pipeTo(createLineWriter('server', CYAN));
}
if (ui.stdout) {
  void ui.stdout.pipeTo(createLineWriter('ui', MAGENTA));
}
if (ui.stderr) {
  void ui.stderr.pipeTo(createLineWriter('ui', MAGENTA));
}

function killAll() {
  server.kill();
  ui.kill();
}

process.on('SIGINT', killAll);
process.on('SIGTERM', killAll);

const first = await Promise.race([
  server.exited.then((code) => ({ name: 'server' as const, code })),
  ui.exited.then((code) => ({ name: 'ui' as const, code })),
]);

const other = first.name === 'server' ? ui : server;
other.kill();
await other.exited;

if (first.code !== 0) {
  console.error(`${DIM}[dev]${RESET} ${first.name} exited with code ${first.code}`);
}

process.exit(first.code);
