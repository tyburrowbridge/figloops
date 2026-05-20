// CLI: store the pushManifest into state.json for the current round.
//
// Reads a JSON payload from stdin matching the pushManifest shape:
//   { pageId: string, frames: Array<{ label, frameId, imageHash }> }
//
// Usage: tsx scripts/set-manifest.ts < manifest.json
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { loadState, writeState, currentRoundData } from '../src/state.js';

function main() {
  const raw = readFileSync(0, 'utf8');
  const manifest = JSON.parse(raw);
  const path = join(process.cwd(), 'feedback', 'state.json');
  const state = loadState(path);
  const round = currentRoundData(state);
  round.pushManifest = manifest;
  writeState(path, state);
  process.stdout.write(
    JSON.stringify({ round: state.currentRound, frameCount: manifest.frames.length }, null, 2),
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`[set-manifest] fatal: ${(err as Error).message}\n`);
  process.exit(1);
}
