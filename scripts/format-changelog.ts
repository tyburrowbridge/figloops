export interface FormatChangelogArgs {
  fromRound: number;
  toRound: number;
  date: string;
  plan: string;
  addressed: string;
}

interface PlanItem {
  text: string;
  drivers: string;
  theme: string;
}

function parsePlan(plan: string): PlanItem[] {
  const items: PlanItem[] = [];
  let currentTheme = '';
  const lines = plan.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const themeMatch = line.match(/^###\s+Theme:\s*(.+?)\s*$/);
    if (themeMatch) {
      currentTheme = themeMatch[1];
      continue;
    }
    const itemMatch = line.match(/^\d+\.\s*\[[ x]\]\s*(.+?)\s*$/);
    if (itemMatch && currentTheme) {
      const text = itemMatch[1];
      const next = lines[i + 1] ?? '';
      const driverMatch = next.match(/^\s*Drives from:\s*(.+?)\s*$/);
      items.push({
        text,
        drivers: driverMatch ? driverMatch[1] : '',
        theme: currentTheme,
      });
    }
  }
  return items;
}

function parseAddressed(addressed: string): string[] {
  return addressed
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim());
}

function normalizeForMatch(s: string): string {
  // Remove common verbs (both base and past tense) at the start
  return s
    .toLowerCase()
    .replace(/^(add|added|increase|increased|move|moved|update|updated|fix|fixed|improve|improved|enhance|enhanced|create|created|remove|removed|change|changed)\s+/i, '')
    .replace(/[.,]/g, '')
    .trim();
}

export function formatChangelog(args: FormatChangelogArgs): string {
  const planItems = parsePlan(args.plan);
  const addressedLines = parseAddressed(args.addressed);
  const header = `## Round ${args.fromRound} → Round ${args.toRound} (${args.date})`;

  if (addressedLines.length === 0) {
    return `${header}\n\n_No changes implemented this round._\n`;
  }

  // Group addressed lines by matching theme via plan items.
  const byTheme = new Map<string, string[]>();

  for (const addr of addressedLines) {
    const addrNorm = normalizeForMatch(addr);
    const match = planItems.find((p) => addrNorm.includes(normalizeForMatch(p.text)));
    const theme = match?.theme ?? 'Other';
    if (!byTheme.has(theme)) byTheme.set(theme, []);
    byTheme.get(theme)!.push(addr);
  }

  const parts = [header, ''];
  for (const [theme, lines] of byTheme) {
    parts.push(`### Theme: ${theme}`);
    for (const line of lines) {
      const driveMatch = line.match(/(.+?)\s*Drove from:\s*(.+)$/);
      if (driveMatch) {
        parts.push(`- ${driveMatch[1].trim()}`);
        parts.push(`  Drove from: ${driveMatch[2].trim()}`);
      } else {
        parts.push(`- ${line}`);
      }
    }
    parts.push('');
  }
  return parts.join('\n').trimEnd() + '\n';
}

// CLI entry point: called by /figma-feedback-close-round.
// Usage: tsx scripts/format-changelog.ts <fromRound> <toRound> <date> <planPath> <addressedPath>
async function main() {
  const [fromRound, toRound, date, planPath, addressedPath] = process.argv.slice(2);
  if (!fromRound || !toRound || !date || !planPath || !addressedPath) {
    process.stderr.write(
      'Usage: tsx scripts/format-changelog.ts <fromRound> <toRound> <date> <planPath> <addressedPath>\n',
    );
    process.exit(1);
  }
  const { readFileSync } = await import('node:fs');
  process.stdout.write(
    formatChangelog({
      fromRound: Number(fromRound),
      toRound: Number(toRound),
      date,
      plan: readFileSync(planPath, 'utf8'),
      addressed: readFileSync(addressedPath, 'utf8'),
    }),
  );
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`[format-changelog] fatal: ${err.message}\n`);
    process.exit(1);
  });
}
