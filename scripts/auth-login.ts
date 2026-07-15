// One-time login helper for authenticated capture. Opens a headed browser at
// the dev server URL; you sign in (SSO/SAML/etc.), then press Enter here to
// save the session cookies to the configured storageState file. Capture and
// scenario discovery reuse that file until the session expires.
//
// The saved file contains live session cookies — treat it as a credential and
// never commit it (add it to .gitignore).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { storageStateTarget } from '../src/auth.js';

function waitForEnter(prompt: string): Promise<void> {
  process.stdout.write(prompt);
  return new Promise((resolve) => {
    const onData = () => {
      process.stdin.pause();
      process.stdin.off('data', onData);
      resolve();
    };
    process.stdin.resume();
    process.stdin.once('data', onData);
  });
}

async function main() {
  const cwd = process.cwd();
  const config = loadConfig(join(cwd, 'figloops.config.json'));
  if (!config.auth?.storageState) {
    throw new Error(
      'auth.storageState is not set in figloops.config.json.\n' +
        'Add it first, e.g.:  "auth": { "storageState": "feedback/.auth/storageState.json" }\n' +
        'Then re-run this helper, and add that path to .gitignore (it holds session cookies).',
    );
  }
  const target = storageStateTarget(cwd, config.auth.storageState);
  mkdirSync(dirname(target), { recursive: true });

  const browser = await chromium.launch({ headless: false });
  try {
    const ctx = await browser.newContext({ viewport: config.viewport });
    const page = await ctx.newPage();
    await page.goto(config.devServer.url, { waitUntil: 'domcontentloaded' });
    await waitForEnter(
      `\nA browser window opened at ${config.devServer.url}\n` +
        `Sign in until you can see the real page, then press Enter here to save the session... `,
    );
    await ctx.storageState({ path: target });
    process.stdout.write(
      `\n✔ Session saved to ${target}\n` +
        `  Add it to .gitignore — it contains live session cookies.\n` +
        `  Re-run this helper when capture starts hitting sign-in pages (session expired).\n`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  process.stderr.write(`[auth-login] fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
