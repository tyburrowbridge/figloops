import { chromium, type Browser, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { loadState, writeState, currentRoundData, type Capture as StateCapture, type UiTheme } from '../src/state.js';
import { createProgress, type ProgressReporter } from '../src/progress.js';
import { waitForAnimations } from '../src/playwright-helpers.js';

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
  kind?: 'modal' | 'panel' | 'menu' | 'tab';
}

export interface CaptureArgs {
  outputDir: string;
  viewport: { width: number; height: number };
  baseUrl: string;
  waitFor: 'networkidle' | 'load' | 'domcontentloaded';
  routes: CaptureRoute[];
  scenarios?: CaptureScenario[];
  cachedTheme?: UiTheme;
}

export interface CaptureResult {
  captures: Array<{ label: string; path: string; filename: string }>;
  failed: Array<{ label: string; error: string }>;
  uiTheme: UiTheme;
}

interface CaptureItem {
  label: string;
  path: string;
  waitFor?: string;
  setup?: string[];
}

interface WorkerSuccess {
  kind: 'ok';
  index: number;
  label: string;
  filename: string;
  path: string;
  luminance: number | null;
}

interface WorkerFailure {
  kind: 'err';
  index: number;
  label: string;
  error: string;
}

type WorkerResult = WorkerSuccess | WorkerFailure;

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function sampleLuminance(page: Page): Promise<number | null> {
  // Passed as a string so TypeScript doesn't type-check browser globals.
  const rgb = await page.evaluate<[number, number, number] | null>(`(() => {
    const parse = (bg) => {
      const m = bg && bg.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?/);
      if (!m) return null;
      const alpha = m[4] === undefined ? 1 : parseFloat(m[4]);
      if (alpha === 0) return null;
      return [+m[1], +m[2], +m[3]];
    };
    let el = document.elementFromPoint(
      Math.floor(window.innerWidth / 2),
      Math.floor(window.innerHeight / 2)
    );
    while (el) {
      const rgb = parse(window.getComputedStyle(el).backgroundColor);
      if (rgb) return rgb;
      el = el.parentElement;
    }
    return parse(window.getComputedStyle(document.body).backgroundColor)
      || parse(window.getComputedStyle(document.documentElement).backgroundColor);
  })()`);
  if (!rgb) return null;
  const [r, g, b] = (rgb as [number, number, number]).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function processItem(
  browser: Browser,
  args: CaptureArgs,
  item: CaptureItem,
  index: number,
  skipLuminance: boolean,
  progress: ProgressReporter | null,
): Promise<WorkerResult> {
  const url = new URL(item.path, args.baseUrl).toString();
  const filename = `${String(index + 1).padStart(2, '0')}-${slug(item.label)}.jpg`;
  const out = join(args.outputDir, filename);
  const start = performance.now();
  const ctx = await browser.newContext({ viewport: args.viewport });
  try {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: args.waitFor, timeout: 30_000 });
    for (const sel of item.setup ?? []) {
      // Auto-waits for the element to be actionable. 10s is enough for any
      // post-navigation interaction; longer just stalls broken scenarios.
      await page.click(sel, { timeout: 10_000 });
    }
    if (item.waitFor) {
      await page.waitForSelector(item.waitFor, { timeout: 10_000 });
    }
    await waitForAnimations(page);
    const luminance = skipLuminance ? null : await sampleLuminance(page);
    await page.screenshot({ path: out, fullPage: true, type: 'jpeg', quality: 85 });
    progress?.tick(item.label, true, performance.now() - start);
    return { kind: 'ok', index, label: item.label, filename, path: out, luminance };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    progress?.tick(item.label, false, performance.now() - start, message);
    return { kind: 'err', index, label: item.label, error: message };
  } finally {
    await ctx.close();
  }
}

export async function capture(args: CaptureArgs): Promise<CaptureResult> {
  mkdirSync(args.outputDir, { recursive: true });
  const browser: Browser = await chromium.launch();
  try {
    // Routes first, then scenarios — both produce numbered captures in one list.
    const items: CaptureItem[] = [
      ...args.routes,
      ...(args.scenarios ?? []),
    ];

    const skipLuminance = args.cachedTheme !== undefined;
    const concurrency = Math.min(4, Math.max(1, items.length));
    const results = new Map<number, WorkerResult>();
    let next = 0;

    const progress = items.length > 0 ? createProgress(items.length, 'capture') : null;

    const workers: Array<Promise<void>> = [];
    for (let w = 0; w < concurrency; w++) {
      workers.push(
        (async () => {
          while (true) {
            const i = next++;
            if (i >= items.length) return;
            const res = await processItem(browser, args, items[i], i, skipLuminance, progress);
            results.set(i, res);
          }
        })(),
      );
    }
    await Promise.all(workers);
    progress?.done();

    const captures: CaptureResult['captures'] = [];
    const failed: CaptureResult['failed'] = [];
    const luminanceSamples: number[] = [];
    for (let i = 0; i < items.length; i++) {
      const r = results.get(i);
      if (!r) continue;
      if (r.kind === 'ok') {
        captures.push({ label: r.label, path: r.path, filename: r.filename });
        if (r.luminance !== null) luminanceSamples.push(r.luminance);
      } else {
        failed.push({ label: r.label, error: r.error });
      }
    }

    let uiTheme: UiTheme;
    if (args.cachedTheme !== undefined) {
      uiTheme = args.cachedTheme;
    } else {
      const avgLuminance =
        luminanceSamples.length > 0
          ? luminanceSamples.reduce((a, b) => a + b, 0) / luminanceSamples.length
          : 0.5;
      uiTheme = avgLuminance > 0.4 ? 'light' : 'dark';
    }

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
    cachedTheme: state.uiTheme,
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
