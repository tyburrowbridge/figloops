// CLI: crawl each route in a browser, click candidate triggers, and detect when
// a modal / slide-over panel / dropdown / tab actually opens — emitting
// ready-to-use scenario objects (stable trigger selector + waitFor on the
// revealed overlay). Replaces hand-authoring scenarios in figloops.config.json.
//
// Input (stdin): { baseUrl, viewport, waitFor, routes: [{label, path}], maxCandidatesPerRoute? }
// Output (stdout, JSON): { baseUrl, candidates: ScenarioCandidate[], skipped: [{path, error}] }
//
// Mirrors scripts/probe-routes.ts (stdin payload + exported fn + main guard) and
// scripts/capture.ts (Playwright + createProgress). Detection runs in the page
// via string predicates so TypeScript doesn't type-check browser globals.
import { waitForAnimations, UNIQUE_SELECTOR_FN } from '../src/playwright-helpers.js';
import { createProgress, type ProgressReporter } from '../src/progress.js';
import { acquireBrowser, type BrowserSession } from '../src/browser.js';

export interface DiscoverRoute {
  label: string;
  path: string;
}

export interface DiscoverArgs {
  baseUrl: string;
  viewport: { width: number; height: number };
  waitFor: 'networkidle' | 'load' | 'domcontentloaded';
  routes: DiscoverRoute[];
  maxCandidatesPerRoute?: number;
  // Absolute path to a Playwright storageState file for authenticated discovery.
  storageState?: string;
  // CDP endpoint to attach to an already-authenticated Chrome (takes precedence).
  cdpEndpoint?: string;
}

export type ScenarioKind = 'modal' | 'panel' | 'menu' | 'tab';

export interface ScenarioCandidate {
  label: string;
  path: string;
  setup: string[];
  waitFor: string;
  kind: ScenarioKind;
  confidence: 'high' | 'medium';
  triggerText: string;
}

export interface DiscoverResult {
  baseUrl: string;
  candidates: ScenarioCandidate[];
  skipped: Array<{ path: string; error: string }>;
}

interface Trigger {
  selector: string;
  text: string;
}

interface DetectHit {
  kind: ScenarioKind;
  confidence: 'high' | 'medium';
  selector: string;
}

const DEFAULT_MAX_CANDIDATES = 20;
const ROUTE_POOL = 3;
const CLICK_TIMEOUT_MS = 2_500;
const OPEN_SETTLE_MS = 500;
const CLOSE_SETTLE_MS = 120;
const OVERLAY_SEL =
  '[role=dialog],[role=alertdialog],[role=menu],[role=listbox],[role=tabpanel],[role=tooltip]';

// Visibility helper shared by every browser-side snippet below.
const VIS_FN = `
  function __vis(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity !== 0;
  }
`;

// page.evaluate(<string>) evaluates the string as a single expression, so each
// snippet is one IIFE with the helper declarations hoisted inside it.

// Tag everything currently *visible* that looks like an overlay so it isn't
// mistaken for newly-revealed content after a click. Hidden-but-prerendered
// modals get no tag (correct — they count as "new" once shown).
const BASELINE_EXPR = `(() => {
    ${VIS_FN}
    document.querySelectorAll(${JSON.stringify(OVERLAY_SEL)}).forEach((el) => {
      if (__vis(el)) el.setAttribute('data-figloops-base', '');
    });
    document.querySelectorAll('*').forEach((el) => {
      const s = getComputedStyle(el);
      if ((s.position === 'fixed' || s.position === 'absolute') && __vis(el)) {
        const r = el.getBoundingClientRect();
        if (r.width >= innerWidth * 0.25 || r.height >= innerHeight * 0.25) {
          el.setAttribute('data-figloops-base', '');
        }
      }
    });
  })()`;

// Is any non-baseline overlay still visible (i.e. did Escape fail to close it)?
const IS_OPEN_EXPR = `(() => {
    ${VIS_FN}
    const els = Array.prototype.slice.call(
      document.querySelectorAll(${JSON.stringify(OVERLAY_SEL)}),
    );
    return els.some((el) => __vis(el) && !el.hasAttribute('data-figloops-base'));
  })()`;

function buildCollectExpr(max: number): string {
  return `(() => {
      ${UNIQUE_SELECTOR_FN}
      ${VIS_FN}
      const TRIGGER_SEL = 'button,[role=button],summary,[aria-haspopup],[aria-expanded],[aria-controls],[role=tab],[data-state]';
      const TEXT_RE = /open|show|add|new|create|edit|menu|filter|settings|details|view|sign ?up|log ?in|cart|profile/i;
      const set = new Set();
      const out = [];
      const push = (el) => {
        if (!el || set.has(el) || !__vis(el)) return;
        set.add(el);
        const sel = uniqueSelector(el);
        if (!sel) return;
        const text = (el.getAttribute('aria-label') || el.textContent || el.value || '')
          .trim().replace(/\\s+/g, ' ').slice(0, 60);
        out.push({ selector: sel, text });
      };
      document.querySelectorAll(TRIGGER_SEL).forEach(push);
      document.querySelectorAll('button,a').forEach((el) => {
        const t = (el.getAttribute('aria-label') || el.textContent || '').trim();
        if (TEXT_RE.test(t)) push(el);
      });
      return out.slice(0, ${max});
    })()`;
}

function buildDetectExpr(triggerSelector: string): string {
  return `(() => {
      ${VIS_FN}
      ${UNIQUE_SELECTOR_FN}
      const trig = document.querySelector(${JSON.stringify(triggerSelector)});
      const newVisible = (sel) =>
        Array.prototype.slice
          .call(document.querySelectorAll(sel))
          .filter((el) => __vis(el) && !el.hasAttribute('data-figloops-base'));

      const modal = newVisible('[role=dialog],[role=alertdialog],[aria-modal="true"]');
      if (modal.length) return { kind: 'modal', confidence: 'high', selector: uniqueSelector(modal[0]) };

      const tabpanel = newVisible('[role=tabpanel]');
      if (tabpanel.length) return { kind: 'tab', confidence: 'high', selector: uniqueSelector(tabpanel[0]) };
      if (trig && trig.getAttribute('aria-expanded') === 'true') {
        const id = trig.getAttribute('aria-controls');
        if (id) {
          const tgt = document.getElementById(id);
          if (tgt && __vis(tgt) && !tgt.hasAttribute('data-figloops-base')) {
            return { kind: 'tab', confidence: 'high', selector: '#' + CSS.escape(id) };
          }
        }
      }

      const menu = newVisible('[role=menu],[role=listbox],[role=tooltip]');
      if (menu.length) return { kind: 'menu', confidence: 'medium', selector: uniqueSelector(menu[0]) };

      const all = Array.prototype.slice.call(document.querySelectorAll('*'));
      for (const el of all) {
        if (el.hasAttribute('data-figloops-base')) continue;
        const s = getComputedStyle(el);
        if (s.position !== 'fixed' && s.position !== 'absolute') continue;
        if (!__vis(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width >= innerWidth * 0.25 || r.height >= innerHeight * 0.25) {
          return { kind: 'panel', confidence: 'medium', selector: uniqueSelector(el) };
        }
      }
      return null;
    })()`;
}

async function processRoute(
  session: BrowserSession,
  args: DiscoverArgs,
  route: DiscoverRoute,
  progress: ProgressReporter | null,
): Promise<{ candidates: ScenarioCandidate[]; skipped: { path: string; error: string } | null }> {
  const url = new URL(route.path, args.baseUrl).toString();
  const targetPath = new URL(url).pathname;
  const max = args.maxCandidatesPerRoute ?? DEFAULT_MAX_CANDIDATES;
  const { page, release } = await session.createPage(args.viewport);
  const found: ScenarioCandidate[] = [];
  const seenOverlay = new Set<string>();
  const start = performance.now();

  const prime = async (p: import('playwright').Page) => {
    await p.goto(url, { waitUntil: args.waitFor, timeout: 30_000 });
    await waitForAnimations(p);
    await p.evaluate(BASELINE_EXPR);
  };

  try {
    await prime(page);
    const triggers = (await page.evaluate(buildCollectExpr(max))) as Trigger[];

    for (const t of triggers) {
      try {
        await page.click(t.selector, { timeout: CLICK_TIMEOUT_MS });
      } catch {
        continue; // not clickable / detached — skip
      }
      await page.waitForTimeout(OPEN_SETTLE_MS);

      // A click that navigated away isn't a scenario — restore and move on.
      if (new URL(page.url()).pathname !== targetPath) {
        await prime(page);
        continue;
      }

      const hit = (await page.evaluate(buildDetectExpr(t.selector))) as DetectHit | null;
      if (hit && hit.selector) {
        const key = `${hit.kind}|${hit.selector}`;
        if (!seenOverlay.has(key)) {
          seenOverlay.add(key);
          const base = (t.text || hit.kind).slice(0, 40);
          found.push({
            label: `${base} — ${hit.kind}`,
            path: route.path,
            setup: [t.selector],
            waitFor: hit.selector,
            kind: hit.kind,
            confidence: hit.confidence,
            triggerText: t.text,
          });
        }
      }

      // Reset to baseline for the next trigger. Escape closes dialogs/menus;
      // a plain drawer (non-dialog) won't respond, so reload whenever we opened
      // something (hit) or an overlay is still up — keeps baseline clean so the
      // next trigger can't re-detect this one's overlay.
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(CLOSE_SETTLE_MS);
      if (hit || ((await page.evaluate(IS_OPEN_EXPR)) as boolean)) await prime(page);
    }

    progress?.tick(route.label, true, performance.now() - start);
    return { candidates: found, skipped: null };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    progress?.tick(route.label, false, performance.now() - start, error);
    return { candidates: found, skipped: { path: route.path, error } };
  } finally {
    await release();
  }
}

export async function discover(args: DiscoverArgs): Promise<DiscoverResult> {
  const session = await acquireBrowser({
    cdpEndpoint: args.cdpEndpoint,
    storageState: args.storageState,
  });
  try {
    const progress = args.routes.length > 0 ? createProgress(args.routes.length, 'discover') : null;
    const candidates: ScenarioCandidate[] = [];
    const skipped: Array<{ path: string; error: string }> = [];

    let next = 0;
    const pool = Math.min(ROUTE_POOL, Math.max(1, args.routes.length));
    const workers = Array.from({ length: pool }, async () => {
      while (next < args.routes.length) {
        const route = args.routes[next++];
        const res = await processRoute(session, args, route, progress);
        candidates.push(...res.candidates);
        if (res.skipped) skipped.push(res.skipped);
      }
    });
    await Promise.all(workers);
    progress?.done();

    // Disambiguate duplicate labels (e.g. two "Edit — modal") so each becomes a
    // distinct Figma frame.
    const counts = new Map<string, number>();
    for (const c of candidates) {
      const n = (counts.get(c.label) ?? 0) + 1;
      counts.set(c.label, n);
      if (n > 1) c.label = `${c.label} (${n})`;
    }

    return { baseUrl: args.baseUrl, candidates, skipped };
  } finally {
    await session.dispose();
  }
}

async function main() {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { loadConfig } = await import('../src/config.js');
  const { resolveStorageState } = await import('../src/auth.js');
  let payload: DiscoverArgs;
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'));
  } catch (err) {
    throw new Error(`stdin is not valid JSON: ${(err as Error).message}`);
  }
  if (!payload.baseUrl || !payload.viewport || !Array.isArray(payload.routes)) {
    throw new Error('stdin must be { baseUrl, viewport, waitFor, routes: [{label, path}] }');
  }
  // Auth comes from the consuming repo's config (not stdin) so discovery reaches
  // the same SSO/SAML-gated pages as capture.
  const cwd = process.cwd();
  const config = loadConfig(join(cwd, 'figloops.config.json'));
  payload.cdpEndpoint = config.auth?.cdpEndpoint;
  // cdpEndpoint wins — skip storageState resolution (errors if the file is
  // missing) when attaching to a live browser.
  payload.storageState = config.auth?.cdpEndpoint
    ? undefined
    : resolveStorageState(cwd, config.auth?.storageState);
  const result = await discover(payload);
  process.stdout.write(JSON.stringify(result, null, 2));
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`[discover-scenarios] fatal: ${(err as Error).message}\n`);
    process.exit(1);
  });
}
