// Pure helpers for the CDP launcher (scripts/auth-cdp.ts). Kept separate from
// the spawn/poll side-effects so the OS resolution is unit-testable.
import { join } from 'node:path';

export interface ChromeLaunchSpec {
  /** Absolute path to the Chrome/Chromium binary. */
  bin: string;
  /** The user's real profile dir, so VPN/SSO cookies + logins are present. */
  profileDir: string;
  /** Process name to check for an already-running instance (profile lock). */
  processName: string;
}

/** Parse the debug port from a cdpEndpoint like "http://localhost:9222". */
export function parsePort(endpoint: string | undefined): number {
  if (!endpoint) return 9222;
  try {
    const p = new URL(endpoint).port;
    return p ? Number(p) : 9222;
  } catch {
    return 9222;
  }
}

/**
 * Resolve how to launch the user's real Chrome with a debug port, per platform.
 * Throws on unsupported platforms with a pointer to the manual command.
 */
export function chromeLaunchSpec(platform: NodeJS.Platform, home: string): ChromeLaunchSpec {
  switch (platform) {
    case 'darwin':
      return {
        bin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        profileDir: join(home, 'Library', 'Application Support', 'Google', 'Chrome'),
        processName: 'Google Chrome',
      };
    case 'linux':
      return {
        bin: 'google-chrome',
        profileDir: join(home, '.config', 'google-chrome'),
        processName: 'chrome',
      };
    default:
      throw new Error(
        `Auto-launch isn't supported on "${platform}". Start Chrome manually with ` +
          `--remote-debugging-port and --user-data-dir pointing at your profile, ` +
          `then set auth.cdpEndpoint. See README "Auth-gated pages".`,
      );
  }
}
