// CLI: probe a dev server to flag routes that are likely stale.
//
// Reads a JSON payload from stdin:
//   { baseUrl: string, routes: Array<{ label, path }> }
//
// For each route, issues a GET to `<baseUrl><path>` and reports reachability.
// Also fetches `<baseUrl>/` once and extracts internal <a href> links so the
// skill can flag routes that exist in code but aren't linked from the entry
// page (often a sign of dead code).
//
// Output (stdout, JSON):
//   {
//     serverReachable: boolean,
//     entryLinks: string[],          // unique normalized paths found on /
//     routes: Array<{
//       label, path,
//       status: number | null,        // null = connection failed
//       reachable: boolean,           // 2xx or 3xx
//       linkedFromEntry: boolean,     // path appears in entryLinks
//       finalUrl?: string,            // if redirected
//       error?: string,
//     }>
//   }
//
// Exit codes:
//   0 = probe ran (even if individual routes failed)
//   1 = stdin invalid OR dev server entirely unreachable (caller decides)
//
// Usage:
//   echo '{"baseUrl":"http://localhost:3000","routes":[...]}' \
//     | tsx scripts/probe-routes.ts

import { readFileSync } from 'node:fs';
import { createProgress, type ProgressReporter } from '../src/progress.js';

interface RouteIn {
  label: string;
  path: string;
}

interface RouteResult {
  label: string;
  path: string;
  status: number | null;
  reachable: boolean;
  linkedFromEntry: boolean;
  finalUrl?: string;
  error?: string;
}

interface ProbeResult {
  serverReachable: boolean;
  entryLinks: string[];
  routes: RouteResult[];
}

const ROUTE_TIMEOUT_MS = 5_000;
const ENTRY_TIMEOUT_MS = 5_000;

function normalizePath(href: string, baseUrl: string): string | null {
  // Strip whitespace + surrounding quotes (defensive)
  const raw = href.trim();
  if (!raw) return null;

  // Resolve against base to handle both absolute (/foo) and relative (foo/bar)
  let url: URL;
  try {
    url = new URL(raw, baseUrl);
  } catch {
    return null;
  }

  // External link — different origin
  const base = new URL(baseUrl);
  if (url.origin !== base.origin) return null;

  // Drop hash + query for comparison purposes
  let p = url.pathname || '/';
  // Trim trailing slash except for root
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

function extractHrefs(html: string): string[] {
  // Simple <a href="..."> extraction. SPAs typically return a near-empty shell
  // so this often yields nothing — that's fine; the skill explains.
  const hrefs: string[] = [];
  const re = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const v = m[1] ?? m[2];
    if (v) hrefs.push(v);
  }
  return hrefs;
}

async function fetchEntryLinks(baseUrl: string): Promise<{ reachable: boolean; links: string[] }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ENTRY_TIMEOUT_MS);
  // Normalize to <origin>/ so calls and mocks agree on the URL
  const entryUrl = new URL('/', baseUrl).toString();
  try {
    const res = await fetch(entryUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) return { reachable: true, links: [] }; // server up but / errored
    const html = await res.text();
    const hrefs = extractHrefs(html);
    const normalized = new Set<string>();
    for (const h of hrefs) {
      const p = normalizePath(h, baseUrl);
      if (p) normalized.add(p);
    }
    return { reachable: true, links: [...normalized].sort() };
  } catch {
    return { reachable: false, links: [] };
  } finally {
    clearTimeout(timer);
  }
}

async function probeOne(
  baseUrl: string,
  route: RouteIn,
  entryLinks: Set<string>,
  progress: ProgressReporter | null,
): Promise<RouteResult> {
  const target = new URL(route.path, baseUrl).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);
  const normPath = normalizePath(route.path, baseUrl) ?? route.path;
  const linkedFromEntry = entryLinks.has(normPath);
  const start = performance.now();

  try {
    const res = await fetch(target, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
    });
    const finalUrl = res.url && res.url !== target ? res.url : undefined;
    const reachable = res.status >= 200 && res.status < 400;
    progress?.tick(route.label, reachable, performance.now() - start, reachable ? undefined : `HTTP ${res.status}`);
    return {
      label: route.label,
      path: route.path,
      status: res.status,
      reachable,
      linkedFromEntry,
      ...(finalUrl ? { finalUrl } : {}),
    };
  } catch (err) {
    const msg = (err as Error).message;
    progress?.tick(route.label, false, performance.now() - start, msg);
    return {
      label: route.label,
      path: route.path,
      status: null,
      reachable: false,
      linkedFromEntry,
      error: msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeRoutes(args: { baseUrl: string; routes: RouteIn[] }): Promise<ProbeResult> {
  const entry = await fetchEntryLinks(args.baseUrl);
  const entrySet = new Set(entry.links);
  const progress = args.routes.length > 0 ? createProgress(args.routes.length, 'probe') : null;
  const results = await Promise.all(args.routes.map((r) => probeOne(args.baseUrl, r, entrySet, progress)));
  progress?.done();
  return { serverReachable: entry.reachable, entryLinks: entry.links, routes: results };
}

async function main() {
  const raw = readFileSync(0, 'utf8');
  let payload: { baseUrl: string; routes: RouteIn[] };
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    throw new Error(`stdin is not valid JSON: ${(err as Error).message}`);
  }
  if (!payload.baseUrl || !Array.isArray(payload.routes)) {
    throw new Error('stdin must be { baseUrl: string, routes: Array<{label, path}> }');
  }
  const result = await probeRoutes(payload);
  process.stdout.write(JSON.stringify(result, null, 2));
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`[probe-routes] fatal: ${err.message}\n`);
    process.exit(1);
  });
}
