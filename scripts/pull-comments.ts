import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { loadConfig } from '../src/config.js';
import { loadState, writeState, currentRoundData, type Comment } from '../src/state.js';
import { fetchComments, filterCommentsByFrameIds } from '../src/figma-client.js';

async function main() {
  loadEnv();
  const token = process.env.FIGMA_TOKEN;
  if (!token || token === 'figd_REPLACE_ME') {
    process.stderr.write('FIGMA_TOKEN missing in .env\n');
    process.exit(1);
  }

  const cwd = process.cwd();
  const config = loadConfig(join(cwd, 'figloops.config.json'));
  const statePath = join(cwd, 'feedback', 'state.json');
  const state = loadState(statePath);
  const round = currentRoundData(state);

  if (!round.pushManifest) {
    process.stderr.write('No pushManifest in state for current round. Run /figloops:next through push first.\n');
    process.exit(1);
  }
  const allowedFrameIds = new Set(round.pushManifest.frames.map((f) => f.frameId));
  const frameById = new Map(round.pushManifest.frames.map((f) => [f.frameId, f.label]));

  const all = await fetchComments({ fileKey: config.figma.fileKey, token });
  const filtered = filterCommentsByFrameIds(all, allowedFrameIds);

  const enriched: Comment[] = filtered.map((c) => ({
    id: c.id,
    frameLabel: c.nodeId ? frameById.get(c.nodeId) ?? null : null,
    nodeId: c.nodeId,
    authorName: c.authorName,
    authorHandle: c.authorHandle,
    message: c.message,
    createdAt: c.createdAt,
    resolved: c.resolved,
  }));

  round.comments = enriched;
  writeState(statePath, state);

  process.stdout.write(
    JSON.stringify(
      {
        round: state.currentRound,
        totalComments: all.length,
        forThisRound: enriched.length,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  process.stderr.write(`[pull-comments] fatal: ${err.message}\n`);
  process.exit(1);
});
