// CLI: print a formatted timestamp, replacing ad-hoc `date '+...'` shell calls
// in the skills (each of which is its own permission prompt). Runs through the
// already-allowlisted tsx pattern.
//
// Usage: tsx scripts/timestamp.ts [mode]
//   page    (default) → "24 June 2026 (3:45 PM)"   (Figma page label)
//   archive           → "20260624-154500"           (archive dir suffix)
//   iso               → "2026-06-24"                (changelog date)
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n: number) => String(n).padStart(2, '0');

function format(mode: string, d: Date): string {
  const Y = d.getFullYear();
  const M = d.getMonth();
  const D = d.getDate();
  switch (mode) {
    case 'archive':
      return `${Y}${pad(M + 1)}${pad(D)}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    case 'iso':
      return `${Y}-${pad(M + 1)}-${pad(D)}`;
    case 'page': {
      const h24 = d.getHours();
      const ampm = h24 < 12 ? 'AM' : 'PM';
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      return `${D} ${MONTHS[M]} ${Y} (${h12}:${pad(d.getMinutes())} ${ampm})`;
    }
    default:
      throw new Error(`unknown mode '${mode}' (expected: page | archive | iso)`);
  }
}

try {
  const mode = process.argv[2] ?? 'page';
  process.stdout.write(format(mode, new Date()));
} catch (err) {
  process.stderr.write(`[timestamp] fatal: ${(err as Error).message}\n`);
  process.exit(1);
}
