// CLI: store themes into state.json for the current round.
//
// Reads a JSON payload from stdin matching the Theme[] shape:
//   [{ name: string, commentIds: string[], summary: string }, ...]
//
// Usage: tsx scripts/set-themes.ts < themes.json
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { loadState, writeState, currentRoundData } from '../src/state.js';

function main() {
  const raw = readFileSync(0, 'utf8');
  const themes = JSON.parse(raw);
  const path = join(process.cwd(), 'feedback', 'state.json');
  const state = loadState(path);
  const round = currentRoundData(state);
  round.themes = themes;
  writeState(path, state);
  process.stdout.write(
    JSON.stringify({ round: state.currentRound, themeCount: themes.length }, null, 2),
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`[set-themes] fatal: ${(err as Error).message}\n`);
  process.exit(1);
}
