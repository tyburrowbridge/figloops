// Simple progress reporter for long-running parallel loops.
// TTY: rewrites a single line with an ASCII bar + counter.
// Non-TTY: prints one line per completion (live tail in piped contexts).
// Writes only to stderr — never pollutes stdout JSON.

export interface ProgressReporter {
  tick(label: string, ok: boolean, durationMs: number, errorMsg?: string): void;
  done(): void;
}

const BAR_WIDTH = 20;

function bar(done: number, total: number): string {
  const filled = total === 0 ? 0 : Math.round((done / total) * BAR_WIDTH);
  return '[' + '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled) + ']';
}

export function createProgress(total: number, tag: string): ProgressReporter {
  let done = 0;
  const stream = process.stderr;
  const tty = Boolean(stream.isTTY);

  return {
    tick(label, ok, durationMs, errorMsg) {
      done++;
      const mark = ok ? '✓' : '✗';
      const ms = Math.round(durationMs);
      const detail = ok ? `${label} (${ms}ms)` : `${label}: ${errorMsg ?? 'failed'}`;
      if (tty) {
        // Clear current line, redraw bar + most-recent item.
        stream.write(`\r\x1b[2K[${tag}] ${bar(done, total)} ${done}/${total} ${mark} ${detail}`);
      } else {
        stream.write(`[${tag}] ${done}/${total} ${mark} ${detail}\n`);
      }
    },
    done() {
      if (tty) stream.write('\n');
    },
  };
}
