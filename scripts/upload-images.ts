import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { loadConfig } from '../src/config.js';
import { loadState } from '../src/state.js';
import { uploadImage } from '../src/figma-client.js';

interface UploadOutput {
  round: number;
  uploads: Array<{ label: string; filename: string; imageHash: string }>;
  failed: Array<{ filename: string; error: string }>;
}

function labelFromFilename(filename: string): string {
  // "01-login.png" -> "Login"; "03-user-settings.png" -> "User Settings"
  const stem = filename.replace(/\.png$/i, '').replace(/^\d+-/, '');
  return stem
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

async function main() {
  loadEnv();
  const token = process.env.FIGMA_TOKEN;
  if (!token || token === 'figd_REPLACE_ME') {
    process.stderr.write(
      'FIGMA_TOKEN missing. Generate one at https://www.figma.com/developers/api#access-tokens and add to .env\n',
    );
    process.exit(1);
  }

  const cwd = process.cwd();
  const config = loadConfig(join(cwd, 'figloops.config.json'));
  const state = loadState(join(cwd, 'feedback', 'state.json'));
  const capturesDir = join(cwd, 'feedback', `round-${state.currentRound}`, 'captures');

  if (!existsSync(capturesDir)) {
    process.stderr.write(`No captures directory at ${capturesDir}. Run /figloops:next first to capture.\n`);
    process.exit(1);
  }

  const files = readdirSync(capturesDir).filter((f) => f.endsWith('.png')).sort();
  const out: UploadOutput = { round: state.currentRound, uploads: [], failed: [] };

  for (const filename of files) {
    const bytes = readFileSync(join(capturesDir, filename));
    try {
      const hash = await uploadImage({
        fileKey: config.figma.fileKey,
        token,
        filename,
        bytes,
      });
      out.uploads.push({ label: labelFromFilename(filename), filename, imageHash: hash });
      process.stderr.write(`[upload] ${filename} -> ${hash}\n`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      out.failed.push({ filename, error: message });
      process.stderr.write(`[upload] FAILED ${filename}: ${message}\n`);
    }
  }

  process.stdout.write(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  process.stderr.write(`[upload-images] fatal: ${err.message}\n`);
  process.exit(1);
});
