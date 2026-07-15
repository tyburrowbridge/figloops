// Authenticated-capture support: resolves the Playwright storageState file
// used to reach SSO/SAML-gated pages. The file holds live session cookies —
// treat it as a credential (never commit it). Generate with auth-login.ts.
import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

/**
 * Resolve the configured storageState path (relative paths are resolved against
 * the consuming repo). Returns `undefined` when auth is not configured — capture
 * then runs with a fresh, unauthenticated context (the default).
 *
 * Throws a clear, actionable error when auth IS configured but the file is
 * missing, so a login run is required before capture rather than silently
 * capturing SSO sign-in pages.
 */
export function resolveStorageState(
  cwd: string,
  storageState: string | undefined,
): string | undefined {
  if (!storageState) return undefined;
  const abs = isAbsolute(storageState) ? storageState : resolve(cwd, storageState);
  if (!existsSync(abs)) {
    throw new Error(
      `auth.storageState is set to "${storageState}" but no session file exists at ${abs}.\n` +
        `Run the login helper first (a browser opens; sign in, then press Enter):\n` +
        `  "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/auth-login.ts"\n` +
        `Session cookies expire — re-run this when capture starts hitting sign-in pages.`,
    );
  }
  return abs;
}

/** Resolve the target path for writing a storageState file (no existence check). */
export function storageStateTarget(cwd: string, storageState: string): string {
  return isAbsolute(storageState) ? storageState : resolve(cwd, storageState);
}
