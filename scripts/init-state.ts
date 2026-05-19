import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { initRoundState } from '../src/round-state.js';

function main() {
  const cwd = process.cwd();
  const dir = join(cwd, 'feedback');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, '.round-state.json');
  initRoundState(path);
  process.stdout.write(JSON.stringify({ initialized: path, currentRound: 1 }, null, 2));
}

try {
  main();
} catch (err) {
  process.stderr.write(`[init-state] fatal: ${(err as Error).message}\n`);
  process.exit(1);
}
