// Pure local teardown for figloops. No network calls. Idempotent.
// Removes:
//   - feedback/                              (state.json, captures, snapshots, .bak)
//   - figloops.config.json                   + figloops.config.*.json.bak
//   - .env lines: FIGMA_TOKEN, FIGLOOPS_PLUGIN_DIR  (delete .env if empty after)
// Leaves Figma file + comments untouched (deliberate — user instructed).
//
// Usage:
//   tsx scripts/uninstall.ts [--dry-run] [--cwd <path>]
//
// Exit codes: 0 success (incl. no-op), 1 unexpected error.
import { existsSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Action =
  | { kind: 'rmdir'; path: string; bytes: number }
  | { kind: 'rmfile'; path: string; bytes: number }
  | { kind: 'env-strip'; path: string; keys: string[] }
  | { kind: 'env-delete'; path: string };

const STRIP_KEYS = ['FIGMA_TOKEN', 'FIGLOOPS_PLUGIN_DIR'];

function parseArgs(argv: string[]): { dryRun: boolean; cwd: string } {
  let dryRun = false;
  let cwd = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') dryRun = true;
    else if (argv[i] === '--cwd') cwd = argv[++i] ?? cwd;
    else {
      process.stderr.write(`Unknown arg: ${argv[i]}\n`);
      process.exit(1);
    }
  }
  return { dryRun, cwd };
}

function dirSize(path: string): number {
  let total = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const p = join(path, entry.name);
    if (entry.isDirectory()) total += dirSize(p);
    else if (entry.isFile()) total += statSync(p).size;
  }
  return total;
}

function detect(cwd: string): Action[] {
  const actions: Action[] = [];

  const feedbackDir = join(cwd, 'feedback');
  if (existsSync(feedbackDir) && statSync(feedbackDir).isDirectory()) {
    actions.push({ kind: 'rmdir', path: feedbackDir, bytes: dirSize(feedbackDir) });
  }

  const config = join(cwd, 'figloops.config.json');
  if (existsSync(config)) {
    actions.push({ kind: 'rmfile', path: config, bytes: statSync(config).size });
  }

  for (const entry of readdirSync(cwd, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (/^figloops\.config\.[\dT:\-]+\.json\.bak$/.test(entry.name) ||
        /^figloops\.config\..+\.json\.bak$/.test(entry.name)) {
      const p = join(cwd, entry.name);
      actions.push({ kind: 'rmfile', path: p, bytes: statSync(p).size });
    }
  }

  const envPath = join(cwd, '.env');
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf8').split('\n');
    const presentKeys = STRIP_KEYS.filter((k) =>
      lines.some((line) => new RegExp(`^\\s*${k}\\s*=`).test(line)),
    );
    if (presentKeys.length > 0) {
      const remaining = lines.filter(
        (line) => !STRIP_KEYS.some((k) => new RegExp(`^\\s*${k}\\s*=`).test(line)),
      );
      const nonBlank = remaining.filter((l) => l.trim() !== '' && !l.trim().startsWith('#'));
      if (nonBlank.length === 0) {
        actions.push({ kind: 'env-delete', path: envPath });
      } else {
        actions.push({ kind: 'env-strip', path: envPath, keys: presentKeys });
      }
    }
  }

  return actions;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function describe(actions: Action[]): string {
  if (actions.length === 0) return 'Nothing to uninstall.';
  const rows = actions.map((a) => {
    switch (a.kind) {
      case 'rmdir': return `  delete dir   ${a.path}  (${fmtBytes(a.bytes)})`;
      case 'rmfile': return `  delete file  ${a.path}  (${fmtBytes(a.bytes)})`;
      case 'env-strip': return `  strip keys   ${a.path}  [${a.keys.join(', ')}]`;
      case 'env-delete': return `  delete file  ${a.path}  (empty after strip)`;
    }
  });
  return rows.join('\n');
}

function apply(actions: Action[]): void {
  for (const a of actions) {
    switch (a.kind) {
      case 'rmdir':
        rmSync(a.path, { recursive: true, force: true });
        break;
      case 'rmfile':
        unlinkSync(a.path);
        break;
      case 'env-strip': {
        const lines = readFileSync(a.path, 'utf8').split('\n');
        const remaining = lines.filter(
          (line) => !STRIP_KEYS.some((k) => new RegExp(`^\\s*${k}\\s*=`).test(line)),
        );
        let out = remaining.join('\n');
        if (!out.endsWith('\n')) out += '\n';
        writeFileSync(a.path, out);
        break;
      }
      case 'env-delete':
        unlinkSync(a.path);
        break;
    }
  }
}

function main() {
  const { dryRun, cwd } = parseArgs(process.argv.slice(2));
  const actions = detect(cwd);

  process.stdout.write(`${describe(actions)}\n`);

  if (actions.length === 0) {
    process.exit(0);
  }

  if (dryRun) {
    process.stdout.write('\n(dry-run — no changes made)\n');
    process.exit(0);
  }

  apply(actions);
  process.stdout.write('\n✓ Local figloops files removed. Figma file untouched.\n');
}

try {
  main();
} catch (err) {
  process.stderr.write(`uninstall failed: ${(err as Error).message}\n`);
  process.exit(1);
}
