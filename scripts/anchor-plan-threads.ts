// Anchors a comment thread on the Figma plan frame for every plan item,
// then posts a bot reminder reply in each thread. Returns updated state.
import { loadState, writeState, type State } from '../src/state.js';
import { postComment, postReply } from '../src/figma-client.js';

export const BOT_REMINDER =
  '🤖 Resolve thread (✓) = shipped · Reply `/skip` = won\'t do · Other replies = discussion';

export interface AnchorArgs {
  state: State;
  round: number;
  fileKey: string;
  token: string;
}

export async function anchorPlanThreads(args: AnchorArgs): Promise<State> {
  const round = args.state.rounds[String(args.round)];
  if (!round) throw new Error(`No round data for round ${args.round}`);
  if (!round.planFrame) throw new Error('planFrame missing — render the plan frame first');

  const next: State = JSON.parse(JSON.stringify(args.state));
  const planNext = next.rounds[String(args.round)].plan;
  const frameId = round.planFrame.frameId;

  for (const item of planNext) {
    if (item.commentId) continue;
    const anchor = await postComment({
      fileKey: args.fileKey,
      token: args.token,
      message: `Item #${(item.rowIndex ?? 0) + 1}: ${item.change}`,
      clientMeta: { node_id: frameId, node_offset: { x: 0, y: 0 } },
    });
    const reply = await postReply({
      fileKey: args.fileKey,
      token: args.token,
      parentId: anchor,
      message: BOT_REMINDER,
    });
    item.commentId = anchor;
    item.botReplyId = reply;
  }
  return next;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , statePath, roundArg, fileKey, token] = process.argv;
  if (!statePath || !roundArg || !fileKey || !token) {
    console.error('Usage: anchor-plan-threads.ts <statePath> <round> <fileKey> <token>');
    process.exit(1);
  }
  const state = loadState(statePath);
  anchorPlanThreads({ state, round: parseInt(roundArg, 10), fileKey, token })
    .then((next) => writeState(statePath, next))
    .catch((err) => { console.error(err.message); process.exit(1); });
}
