import { chromium, type Browser, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { loadState, writeState, currentRoundData, type Capture as StateCapture, type UiTheme } from '../src/state.js';

export interface CaptureRoute {
  label: string;
  path: string;
  waitFor?: string;
}

export interface CaptureScenario {
  label: string;
  path: string;
  setup?: string[];
  waitFor?: string;
}

export interface CaptureArgs {
  outputDir: string;
  viewport: { width: number; height: number };
  baseUrl: string;
  waitFor: 'networkidle' | 'load' | 'domcontentloaded';
  routes: CaptureRoute[];
  scenarios?: CaptureScenario[];
}

export interface CaptureResult {
  captures: Array<{ label: string; path: string; filename: string }>;
  failed: Array<{ label: string; error: string }>;
  uiTheme: UiTheme;
}

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function sampleLuminance(page: Page): Promise<number | null> {
  // Passed as a string so TypeScript doesn't type-check browser globals.
  const rgb = await page.evaluate<[number, number, number] | null>(`(() => {
    const el = document.elementFromPoint(
      Math.floor(window.innerWidth / 2),
      Math.floor(window.innerHeight / 2)
    );
    const style = window.getComputedStyle(el || document.body);
    const bg = style.backgroundColor;
    const m = bg.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
    return m ? [+m[1], +m[2], +m[3]] : null;
  })()`);
  if (!rgb) return null;
  const [r, g, b] = (rgb as [number, number, number]).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export async function capture(args: CaptureArgs): Promise<CaptureResult> {
  mkdirSync(args.outputDir, { recursive: true });
  const browser: Browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: args.viewport });
    const page = await ctx.newPage();
    const captures: CaptureResult['captures'] = [];
    const failed: CaptureResult['failed'] = [];
    const luminanceSamples: number[] = [];

    // Routes first, then scenarios — both produce numbered captures in one list.
    const items: Array<CaptureRoute & { setup?: string[] }> = [
      ...args.routes,
      ...(args.scenarios ?? []),
    ];

    for (let i = 0; i < items.length; i++) {
      const r = items[i];
      const url = new URL(r.path, args.baseUrl).toString();
      const filename = `${String(i + 1).padStart(2, '0')}-${slug(r.label)}.png`;
      const out = join(args.outputDir, filename);
      try {
        await page.goto(url, { waitUntil: args.waitFor, timeout: 30_000 });
        for (const sel of r.setup ?? []) {
          // Auto-waits for the element to be actionable. 10s is enough for any
          // post-navigation interaction; longer just stalls broken scenarios.
          await page.click(sel, { timeout: 10_000 });
        }
        if (r.waitFor) {
          await page.waitForSelector(r.waitFor, { timeout: 10_000 });
        }
        const lum = await sampleLuminance(page);
        if (lum !== null) luminanceSamples.push(lum);
        await page.screenshot({ path: out, fullPage: true });
        captures.push({ label: r.label, path: out, filename });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failed.push({ label: r.label, error: message });
        process.stderr.write(`[capture] skipped ${r.label}: ${message}\n`);
      }
    }

    const avgLuminance =
      luminanceSamples.length > 0
        ? luminanceSamples.reduce((a, b) => a + b, 0) / luminanceSamples.length
        : 0.5;
    const uiTheme: UiTheme = avgLuminance > 0.4 ? 'light' : 'dark';

    return { captures, failed, uiTheme };
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
    scenarios: config.scenarios?.map((s) => ({
      label: s.label,
      path: s.path,
      setup: s.setup,
      waitFor: s.waitFor,
    })),
  });

  // Persist into state.json for the current round.
  // Look up the URL path from either routes or scenarios by label.
  const labelToPath = new Map<string, string>([
    ...config.routes.map((r) => [r.label, r.path] as const),
    ...(config.scenarios ?? []).map((s) => [s.label, s.path] as const),
  ]);
  const round = currentRoundData(state);
  round.captures = result.captures.map<StateCapture>((c) => ({
    label: c.label,
    path: labelToPath.get(c.label)!,
    filename: c.filename,
  }));
  state.uiTheme = result.uiTheme;
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
