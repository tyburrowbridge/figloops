// CLI: restart the current round — delete its captures folder and reset its
// state entry back to the capture phase. Replaces the `rm -rf` + inline
// `tsx -e` pair in the restart skill with one allowlisted tsx call (no need to
// allowlist `rm -rf`).
//
// Usage: tsx scripts/reset-round.ts
// Output (stdout): { round: <N>, removed: <bool> }
import { join } from 'node:path';
import { rmSync, existsSync } from 'node:fs';
import { loadState, writeState, emptyRound } from '../src/state.js';

function main() {
  const cwd = process.cwd();
  const statePath = join(cwd, 'feedback', 'state.json');
  const state = loadState(statePath);
  const round = state.currentRound;

  const capturesDir = join(cwd, 'feedback', `round-${round}`, 'captures');
  const removed = existsSync(capturesDir);
  if (removed) rmSync(capturesDir, { recursive: true, force: true });

  state.rounds[String(round)] = emptyRound();
  state.currentPhase = 'capture';
  writeState(statePath, state);

  process.stdout.write(JSON.stringify({ round, removed }, null, 2));
}

try {
  main();
} catch (err) {
  process.stderr.write(`[reset-round] fatal: ${(err as Error).message}\n`);
  process.exit(1);
}
