// Formats a per-round changelog markdown block from state.json's plan items.
// Used by the skill in the `close` phase: output is written via MCP to a
// text frame on the Changelog page in Figma.
import { join } from 'node:path';
import { loadState, currentRoundData, type Comment, type PlanItem, type RoundData } from '../src/state.js';

export interface FormatChangelogArgs {
  fromRound: number;
  toRound: number;
  date: string;
  round: RoundData;
}

function cite(comments: Comment[], ids: string[]): string {
  const byId = new Map(comments.map((c) => [c.id, c]));
  return ids
    .map((id) => {
      const c = byId.get(id);
      return c ? `${c.authorName} (#${id})` : `#${id}`;
    })
    .join(', ');
}

export function formatChangelog(args: FormatChangelogArgs): string {
  const { fromRound, toRound, date, round } = args;
  const header = `## Round ${fromRound} → Round ${toRound} (${date})`;
  if (round.plan.length === 0) {
    return `${header}\n\n_No changes implemented this round._\n`;
  }
  const shipped = round.plan.filter((p) => p.status === 'shipped');
  if (shipped.length === 0) {
    return `${header}\n\n_Round ${fromRound} → Round ${toRound}: feedback not actionable this round._\n`;
  }

  const byTheme = new Map<string, PlanItem[]>();
  for (const item of shipped) {
    const list = byTheme.get(item.themeName) ?? [];
    list.push(item);
    byTheme.set(item.themeName, list);
  }

  const parts: string[] = [header, ''];
  for (const [theme, items] of byTheme) {
    parts.push(`### Theme: ${theme}`);
    for (const item of items) {
      parts.push(`- ${item.change}`);
      parts.push(`  Drove from: ${cite(round.comments, item.drivesFrom)}`);
    }
    parts.push('');
  }
  return parts.join('\n').trimEnd() + '\n';
}

// CLI entry point: the skill invokes this during the close phase.
// Usage: tsx scripts/format-changelog.ts <fromRound> <toRound> <date>
//   Reads from feedback/state.json. <fromRound> must equal state.currentRound.
async function main() {
  const [fromRound, toRound, date] = process.argv.slice(2);
  if (!fromRound || !toRound || !date) {
    process.stderr.write('Usage: tsx scripts/format-changelog.ts <fromRound> <toRound> <date>\n');
    process.exit(1);
  }
  const cwd = process.cwd();
  const state = loadState(join(cwd, 'feedback', 'state.json'));
  if (Number(fromRound) !== state.currentRound) {
    process.stderr.write(`fromRound (${fromRound}) does not match state.currentRound (${state.currentRound})\n`);
    process.exit(1);
  }
  const round = currentRoundData(state);
  process.stdout.write(
    formatChangelog({ fromRound: Number(fromRound), toRound: Number(toRound), date, round }),
  );
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`[format-changelog] fatal: ${err.message}\n`);
    process.exit(1);
  });
}
