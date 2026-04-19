import pc from 'picocolors';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const INTERVAL_MS = 80;
const DELAY_MS = 100;

export function createSpinner() {
  let timer: ReturnType<typeof setInterval> | undefined;
  let delayTimer: ReturnType<typeof setTimeout> | undefined;
  let frame = 0;

  function clear() {
    process.stdout.write('\r\x1b[K');
  }

  return {
    start() {
      delayTimer = setTimeout(() => {
        timer = setInterval(() => {
          clear();
          process.stdout.write(pc.dim(FRAMES[frame % FRAMES.length]));
          frame++;
        }, INTERVAL_MS);
      }, DELAY_MS);
    },
    stop() {
      if (delayTimer) {
        clearTimeout(delayTimer);
        delayTimer = undefined;
      }
      if (timer) {
        clearInterval(timer);
        timer = undefined;
        clear();
      }
    },
  };
}
