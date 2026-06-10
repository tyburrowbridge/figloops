// Pulls thread states from Figma and computes a status per plan item.
// Parse rule: any /skip reply matching ^/skip\b → wontdo.
// Else: resolved_at !== null → shipped. Else: pending.
// Missing thread (commentId not found) → removed.
import { fetchComments, type FigmaComment } from '../src/figma-client.js';
import { loadState, writeState, type State, type PlanStatus } from '../src/state.js';

const SKIP_RE = /^\/skip\b/i;

export function parseItemStatus(thread: FigmaComment): PlanStatus {
  for (const r of thread.replies) {
    if (SKIP_RE.test(r.message.trim())) return 'wontdo';
  }
  if (thread.resolved) return 'shipped';
  return 'pending';
}

export interface PullArgs {
  fileKey: string;
  token: string;
  items: Array<{ id: string; commentId: string; currentStatus: PlanStatus }>;
}

export interface PullResult {
  statuses: Record<string, PlanStatus>;
  delta: { shipped: string[]; wontdo: string[]; pending: string[]; removed: string[] };
}

export async function pullPlanStates(args: PullArgs): Promise<PullResult> {
  const threads = await fetchComments({ fileKey: args.fileKey, token: args.token });
  const byId = new Map(threads.map((t) => [t.id, t]));
  const statuses: Record<string, PlanStatus> = {};
  const delta = { shipped: [] as string[], wontdo: [] as string[], pending: [] as string[], removed: [] as string[] };
  for (const item of args.items) {
    const thread = byId.get(item.commentId);
    const status: PlanStatus = thread ? parseItemStatus(thread) : 'removed';
    statuses[item.id] = status;
    if (status !== item.currentStatus) {
      delta[status].push(item.id);
    } else if (status === 'pending') {
      delta.pending.push(item.id);
    }
  }
  return { statuses, delta };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , statePath, roundArg, fileKey, token] = process.argv;
  if (!statePath || !roundArg || !fileKey || !token) {
    console.error('Usage: pull-plan-states.ts <statePath> <round> <fileKey> <token>');
    process.exit(1);
  }
  const state = loadState(statePath);
  const round = parseInt(roundArg, 10);
  const planItems = (state.rounds[String(round)]?.plan ?? [])
    .filter((p) => p.commentId)
    .map((p) => ({ id: p.id, commentId: p.commentId!, currentStatus: p.status }));
  pullPlanStates({ fileKey, token, items: planItems })
    .then((result) => {
      const next = JSON.parse(JSON.stringify(state)) as State;
      for (const p of next.rounds[String(round)].plan) {
        const s = result.statuses[p.id];
        if (s) p.status = s;
      }
      writeState(statePath, next);
      process.stdout.write(JSON.stringify(result));
    })
    .catch((err) => { console.error(err.message); process.exit(1); });
}
