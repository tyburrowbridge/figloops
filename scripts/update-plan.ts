// CLI: set or update plan items for the current round.
//
// Reads a JSON payload from stdin:
//   { action: 'set', items: PlanItem[] }
//   { action: 'status', updates: Array<{ id: string; status: PlanStatus }> }
//
// Usage: tsx scripts/update-plan.ts < payload.json
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { loadState, writeState, currentRoundData, planStatusSchema, type PlanItem } from '../src/state.js';

interface SetPayload { action: 'set'; items: PlanItem[]; }
interface StatusPayload { action: 'status'; updates: Array<{ id: string; status: string }>; }

function readStdin(): string {
  return readFileSync(0, 'utf8');
}

function main() {
  const raw = readStdin();
  const payload = JSON.parse(raw) as SetPayload | StatusPayload;
  const path = join(process.cwd(), 'feedback', 'state.json');
  const state = loadState(path);
  const round = currentRoundData(state);

  if (payload.action === 'set') {
    round.plan = payload.items;
  } else if (payload.action === 'status') {
    for (const u of payload.updates) {
      const item = round.plan.find((p) => p.id === u.id);
      if (!item) {
        throw new Error(`update-plan: unknown plan item id "${u.id}"`);
      }
      const parsed = planStatusSchema.safeParse(u.status);
      if (!parsed.success) {
        throw new Error(`update-plan: invalid status "${u.status}"`);
      }
      item.status = parsed.data;
    }
  } else {
    throw new Error(`update-plan: unknown action`);
  }

  writeState(path, state);
  process.stdout.write(JSON.stringify({ round: state.currentRound, planCount: round.plan.length }, null, 2));
}

try {
  main();
} catch (err) {
  process.stderr.write(`[update-plan] fatal: ${(err as Error).message}\n`);
  process.exit(1);
}
