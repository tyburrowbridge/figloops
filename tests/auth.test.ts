import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveStorageState, storageStateTarget } from '../src/auth.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'figloops-auth-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('resolveStorageState', () => {
  it('returns undefined when auth is not configured', () => {
    expect(resolveStorageState(dir, undefined)).toBeUndefined();
  });

  it('throws an actionable error when configured but the file is missing', () => {
    expect(() => resolveStorageState(dir, 'feedback/auth.json')).toThrow(
      /login helper/i,
    );
  });

  it('returns the absolute path when the configured file exists', () => {
    const abs = join(dir, 'session.json');
    writeFileSync(abs, '{}');
    expect(resolveStorageState(dir, 'session.json')).toBe(abs);
  });

  it('accepts an absolute configured path', () => {
    const abs = join(dir, 'session.json');
    writeFileSync(abs, '{}');
    expect(resolveStorageState(dir, abs)).toBe(abs);
  });
});

describe('storageStateTarget', () => {
  it('resolves relative paths against cwd', () => {
    const t = storageStateTarget(dir, 'feedback/.auth/state.json');
    expect(isAbsolute(t)).toBe(true);
    expect(t).toBe(join(dir, 'feedback/.auth/state.json'));
  });

  it('passes absolute paths through unchanged', () => {
    const abs = join(dir, 'x.json');
    expect(storageStateTarget(dir, abs)).toBe(abs);
  });
});
