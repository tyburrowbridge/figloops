// CLI: POST capture bytes to MCP-provided presigned upload URLs (bounded
// concurrency), then POST any commit URLs once each.
//
// Replaces the parallel `curl -X POST --data-binary @file <url>` block plus the
// follow-up commit curls in the push phase — one tsx invocation (already
// allowlisted) instead of many curl prompts. Distinct from the `uploadImage`
// REST helper in src/figma-client.ts (that targets /v1/images/{fileKey}).
//
// Usage: echo '<json>' | tsx scripts/upload-to-urls.ts
// Input (stdin): [{ file, uploadUrl, commitUrl?, contentType? }, ...]
//   contentType is optional — derived from the file extension when omitted.
// Output (stdout): { uploaded, failed, commitFailed }
//
// Per the push contract, individual upload failures are surfaced but do NOT
// abort — the remaining frames still upload, and exit stays 0. A *commit*
// failure is silent corruption (the blob never finalizes → blank frame), so it
// is reported AND forces a non-zero exit.
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

interface UploadItem {
  file: string;
  uploadUrl: string;
  commitUrl?: string;
  contentType?: string;
}

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function contentTypeFor(item: UploadItem): string {
  if (item.contentType) return item.contentType;
  return MIME[extname(item.file).toLowerCase()] ?? 'application/octet-stream';
}

const CONCURRENCY = 4;

async function main() {
  const items: UploadItem[] = JSON.parse(readFileSync(0, 'utf8'));

  const uploaded: string[] = [];
  const failed: Array<{ file: string; error: string }> = [];

  // Worker pool — only CONCURRENCY files are read into memory and in flight at
  // once (peak RAM ≈ CONCURRENCY × largest file, not the sum of all captures).
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const it = items[next++];
      try {
        const res = await fetch(it.uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': contentTypeFor(it) },
          body: await readFile(it.file),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        uploaded.push(it.file);
        process.stderr.write(`[push] ✓ ${it.file}\n`);
      } catch (err) {
        const error = (err as Error).message;
        failed.push({ file: it.file, error });
        process.stderr.write(`[push] ✗ ${it.file} — ${error}\n`);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker),
  );

  // Commit each distinct commit URL once (only for items that uploaded ok).
  const commitFailed: Array<{ url: string; error: string }> = [];
  const commitUrls = [
    ...new Set(
      items
        .filter((it) => it.commitUrl && uploaded.includes(it.file))
        .map((it) => it.commitUrl as string),
    ),
  ];
  for (const url of commitUrls) {
    try {
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    } catch (err) {
      const error = (err as Error).message;
      commitFailed.push({ url, error });
      process.stderr.write(`[push] ✗ commit failed — ${error}\n`);
    }
  }

  process.stderr.write(
    `[push] ${uploaded.length} uploaded, ${failed.length} failed, ${commitFailed.length} commit failures\n`,
  );
  process.stdout.write(JSON.stringify({ uploaded, failed, commitFailed }, null, 2));

  // A failed commit means an uploaded blob never finalized — surface it as a
  // hard failure so the push phase halts instead of advancing with blank frames.
  if (commitFailed.length > 0) process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`[upload-to-urls] fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
