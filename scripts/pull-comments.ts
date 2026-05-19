import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { loadConfig } from '../src/config.js';
import { readRoundState } from '../src/round-state.js';
import { fetchComments, filterCommentsByFrameIds, type FigmaComment } from '../src/figma-client.js';

interface PushManifest {
  round: number;
  page_id: string;
  frames: Array<{ label: string; frame_id: string; image_hash: string }>;
}

async function main() {
  loadEnv();
  const token = process.env.FIGMA_TOKEN;
  if (!token || token === 'figd_REPLACE_ME') {
    process.stderr.write('FIGMA_TOKEN missing in .env\n');
    process.exit(1);
  }

  const cwd = process.cwd();
  const config = loadConfig(join(cwd, 'figma-feedback.config.json'));
  const state = readRoundState(join(cwd, 'feedback', '.round-state.json'));
  const roundDir = join(cwd, 'feedback', `round-${state.currentRound}`);
  const manifestPath = join(roundDir, 'push-manifest.json');

  if (!existsSync(manifestPath)) {
    process.stderr.write(
      `No push-manifest.json at ${manifestPath}. Run /figma-feedback-push first.\n`,
    );
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PushManifest;
  const allowedFrameIds = new Set(manifest.frames.map((f) => f.frame_id));

  const all = await fetchComments({ fileKey: config.figma.fileKey, token });
  const filtered = filterCommentsByFrameIds(all, allowedFrameIds);

  // Attach the frame label to each comment for downstream readability
  const frameById = new Map(manifest.frames.map((f) => [f.frame_id, f.label]));
  const enriched = filtered.map((c) => ({
    ...c,
    frame_label: c.nodeId ? frameById.get(c.nodeId) ?? null : null,
  }));

  const outPath = join(roundDir, 'comments.json');
  writeFileSync(outPath, JSON.stringify(enriched, null, 2) + '\n');

  process.stdout.write(
    JSON.stringify(
      {
        round: state.currentRound,
        totalComments: all.length,
        forThisRound: enriched.length,
        wroteTo: outPath,
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
