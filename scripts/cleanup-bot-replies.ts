import { loadState, type State } from '../src/state.js';
import { deleteComment } from '../src/figma-client.js';

export interface CleanupArgs {
  state: State;
  round: number;
  fileKey: string;
  token: string;
}

export async function cleanupBotReplies(args: CleanupArgs): Promise<void> {
  const r = args.state.rounds[String(args.round)];
  if (!r) return;
  for (const item of r.plan) {
    if (!item.botReplyId) continue;
    await deleteComment({ fileKey: args.fileKey, token: args.token, commentId: item.botReplyId });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , statePath, roundArg, fileKey, token] = process.argv;
  if (!statePath || !roundArg || !fileKey || !token) {
    console.error('Usage: cleanup-bot-replies.ts <statePath> <round> <fileKey> <token>');
    process.exit(1);
  }
  cleanupBotReplies({ state: loadState(statePath), round: parseInt(roundArg, 10), fileKey, token })
    .catch((err) => { console.error(err.message); process.exit(1); });
}
