import { chromium, type Browser } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { loadState, writeState, currentRoundData, type Capture as StateCapture } from '../src/state.js';

export interface CaptureRoute {
  label: string;
  path: string;
  waitFor?: string;
}

export interface CaptureArgs {
  outputDir: string;
  viewport: { width: number; height: number };
  baseUrl: string;
  waitFor: 'networkidle' | 'load' | 'domcontentloaded';
  routes: CaptureRoute[];
}

export interface CaptureResult {
  captures: Array<{ label: string; path: string; filename: string }>;
  failed: Array<{ label: string; error: string }>;
}

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function capture(args: CaptureArgs): Promise<CaptureResult> {
  mkdirSync(args.outputDir, { recursive: true });
  const browser: Browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: args.viewport });
    const page = await ctx.newPage();
    const captures: CaptureResult['captures'] = [];
    const failed: CaptureResult['failed'] = [];

    for (let i = 0; i < args.routes.length; i++) {
      const r = args.routes[i];
      const url = new URL(r.path, args.baseUrl).toString();
      const filename = `${String(i + 1).padStart(2, '0')}-${slug(r.label)}.png`;
      const out = join(args.outputDir, filename);
      try {
        await page.goto(url, { waitUntil: args.waitFor, timeout: 30_000 });
        if (r.waitFor) {
          await page.waitForSelector(r.waitFor, { timeout: 10_000 });
        }
        await page.screenshot({ path: out, fullPage: true });
        captures.push({ label: r.label, path: out, filename });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failed.push({ label: r.label, error: message });
        process.stderr.write(`[capture] skipped ${r.label}: ${message}\n`);
      }
    }
    return { captures, failed };
  } finally {
    await browser.close();
  }
}

// CLI entry point: invoked by the figloops skill (capture phase)
async function main() {
  const cwd = process.cwd();
  const config = loadConfig(join(cwd, 'figloops.config.json'));
  const statePath = join(cwd, 'feedback', 'state.json');
  const state = loadState(statePath);
  const outDir = join(cwd, 'feedback', `round-${state.currentRound}`, 'captures');

  const result = await capture({
    outputDir: outDir,
    viewport: config.viewport,
    baseUrl: config.devServer.url,
    waitFor: config.devServer.waitFor,
    routes: config.routes.map((r) => ({ label: r.label, path: r.path, waitFor: r.waitFor })),
  });

  // Persist into state.json for the current round
  const round = currentRoundData(state);
  round.captures = result.captures.map<StateCapture>((c) => ({
    label: c.label,
    path: config.routes.find((r) => r.label === c.label)!.path,
    filename: c.filename,
  }));
  writeState(statePath, state);

  process.stdout.write(JSON.stringify({ round: state.currentRound, ...result }, null, 2));
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`[capture] fatal: ${err.message}\n`);
    process.exit(1);
  });
}
