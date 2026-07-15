// Launch the user's real Chrome with a remote-debugging port so capture can
// attach to a live, already-authenticated session (auth.cdpEndpoint mode).
// Removes the need to memorize the raw flag command — you just sign in.
import { spawn, execFileSync } from 'node:child_process';
import { connect } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { parsePort, chromeLaunchSpec } from '../src/cdp.js';

/** Resolve when a TCP port accepts connections (i.e. CDP is up). */
function portOpen(port: number, timeoutMs = 700): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = connect({ host: '127.0.0.1', port });
    const done = (ok: boolean) => {
      sock.destroy();
      resolve(ok);
    };
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
    sock.setTimeout(timeoutMs, () => done(false));
  });
}

/** Is a Chrome process already holding the profile? (best-effort, unix only) */
function chromeRunning(processName: string): boolean {
  try {
    execFileSync('pgrep', ['-f', processName], { stdio: 'ignore' });
    return true;
  } catch {
    return false; // pgrep exits non-zero when no match
  }
}

async function waitForPort(port: number, tries = 20): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (await portOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  const cwd = process.cwd();
  const config = loadConfig(join(cwd, 'figloops.config.json'));
  const port = parsePort(config.auth?.cdpEndpoint);

  if (await portOpen(port)) {
    process.stdout.write(
      `✔ Chrome is already listening on :${port}. You're ready — run capture.\n`,
    );
    return;
  }

  const spec = chromeLaunchSpec(process.platform, homedir());

  if (chromeRunning(spec.processName)) {
    throw new Error(
      `Chrome is already running, which locks the profile and blocks the debug port.\n` +
        `Quit Chrome completely (Cmd+Q), then re-run this.`,
    );
  }

  const child = spawn(
    spec.bin,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${spec.profileDir}`,
      config.devServer.url,
    ],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();

  if (!(await waitForPort(port))) {
    throw new Error(
      `Launched Chrome but nothing came up on :${port}. ` +
        `Check that Chrome is installed at ${spec.bin}.`,
    );
  }

  process.stdout.write(
    `✔ Chrome launched with debug port :${port} using your profile.\n` +
      `  1. Make sure you're on VPN and signed in to the target.\n` +
      `  2. Leave this Chrome window open.\n` +
      `  3. Run capture — figloops attaches to it (auth.cdpEndpoint).\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`[auth-cdp] fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
