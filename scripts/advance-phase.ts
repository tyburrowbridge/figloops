// CLI: advance the figloops state machine to the named phase.
// If transitioning from 'close' to 'capture', also bumps currentRound and
// initializes the next round's entry.
//
// Usage: tsx scripts/advance-phase.ts <phase>
import { join } from 'node:path';
import { loadState, writeState, ensureRound, phaseSchema, type Phase } from '../src/state.js';

function main() {
  const arg = process.argv[2];
  if (!arg) {
    process.stderr.write('Usage: tsx scripts/advance-phase.ts <phase>\n');
    process.exit(1);
  }
  const parsed = phaseSchema.safeParse(arg);
  if (!parsed.success) {
    process.stderr.write(`Unknown phase: ${arg}\n`);
    process.exit(1);
  }
  const phase: Phase = parsed.data;
  const path = join(process.cwd(), 'feedback', 'state.json');
  const state = loadState(path);
  const wasClose = state.currentPhase === 'close';
  if (wasClose && phase === 'capture') {
    state.rounds[String(state.currentRound)].completedAt = new Date().toISOString();
    state.currentRound += 1;
    ensureRound(state, state.currentRound);
  }
  state.currentPhase = phase;
  writeState(path, state);
  process.stdout.write(
    JSON.stringify({ currentRound: state.currentRound, currentPhase: state.currentPhase }, null, 2),
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`[advance-phase] fatal: ${(err as Error).message}\n`);
  process.exit(1);
}
