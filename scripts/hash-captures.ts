// CLI: SHA-256 every capture image in a directory, in one call.
//
// Replaces the per-file `shasum -a 256 <f> | cut -d' ' -f1` loop in the push
// phase — a single tsx invocation instead of N shell calls (each a prompt).
//
// Usage: tsx scripts/hash-captures.ts <capturesDir>
// Output (stdout): { "<filename>": "<sha256hex>", ... }
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const IMAGE_RE = /\.(png|jpe?g|webp)$/i;

function main() {
  const dir = process.argv[2];
  if (!dir) {
    process.stderr.write('Usage: hash-captures.ts <capturesDir>\n');
    process.exit(1);
  }

  const files = readdirSync(dir)
    .filter((f) => IMAGE_RE.test(f))
    .sort();

  const hashes: Record<string, string> = {};
  for (const f of files) {
    // Skip a file that vanished/locked between readdir and read rather than
    // aborting the whole run — a partial manifest beats losing every hash.
    try {
      hashes[f] = createHash('sha256').update(readFileSync(join(dir, f))).digest('hex');
    } catch (err) {
      process.stderr.write(`[hash-captures] skipped ${f}: ${(err as Error).message}\n`);
    }
  }

  process.stdout.write(JSON.stringify(hashes, null, 2));
}

try {
  main();
} catch (err) {
  process.stderr.write(`[hash-captures] fatal: ${(err as Error).message}\n`);
  process.exit(1);
}
