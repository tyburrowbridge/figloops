// CLI: merge discovered scenarios into figloops.config.json (dedupe, validate,
// write). Used by /figloops:discover after the user picks candidates. Init
// writes its config in one shot, so it does NOT use this.
//
// Usage: echo '<scenarios JSON>' | tsx scripts/merge-scenarios.ts [configPath]
// Input (stdin): CaptureScenario[]  (the picked candidates)
// Output (stdout, JSON): { added, skipped, total }
import { readFileSync, writeFileSync } from 'node:fs';
import { configSchema } from '../src/config.js';

export type Scenario = NonNullable<ReturnType<typeof configSchema.parse>['scenarios']>[number];

// A scenario is identified by where it navigates plus the clicks that set it up.
function keyOf(s: Scenario): string {
  return `${s.path}::${[...(s.setup ?? [])].sort().join(';')}`;
}

export function mergeScenarios(
  existing: Scenario[],
  incoming: Scenario[],
): { scenarios: Scenario[]; added: number; skipped: number } {
  const merged = [...existing];
  const seen = new Set(merged.map(keyOf));
  let added = 0;
  let skipped = 0;
  for (const s of incoming) {
    const k = keyOf(s);
    if (seen.has(k)) {
      skipped++;
      continue;
    }
    seen.add(k);
    merged.push(s);
    added++;
  }
  return { scenarios: merged, added, skipped };
}

function main() {
  const configPath = process.argv[2] ?? 'figloops.config.json';
  const incoming: Scenario[] = JSON.parse(readFileSync(0, 'utf8'));
  if (!Array.isArray(incoming)) throw new Error('stdin must be a JSON array of scenarios');

  const raw = JSON.parse(readFileSync(configPath, 'utf8'));
  const existing: Scenario[] = Array.isArray(raw.scenarios) ? raw.scenarios : [];
  const { scenarios, added, skipped } = mergeScenarios(existing, incoming);

  const merged = { ...raw, scenarios };
  const result = configSchema.safeParse(merged);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('\n');
    throw new Error(`Merged config is invalid — not written:\n${issues}`);
  }

  writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`);
  process.stdout.write(JSON.stringify({ added, skipped, total: scenarios.length }, null, 2));
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`[merge-scenarios] fatal: ${(err as Error).message}\n`);
    process.exit(1);
  }
}
