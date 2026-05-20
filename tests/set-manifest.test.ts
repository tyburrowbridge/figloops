import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { initState, loadState } from '../src/state.js';

const TSX = join(process.cwd(), 'node_modules', '.bin', 'tsx');
const SCRIPT = join(process.cwd(), 'scripts', 'set-manifest.ts');

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'figloops-mani-'));
  mkdirSync(join(dir, 'feedback'));
  initState(join(dir, 'feedback', 'state.json'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('set-manifest', () => {
  it('stores pushManifest into state.json for the current round', () => {
    const payload = JSON.stringify({
      pageId: '12:33',
      frames: [
        { label: 'Login', frameId: '12:34', imageHash: 'abc' },
        { label: 'Dashboard', frameId: '12:56', imageHash: 'def' },
      ],
    });
    execSync(`${TSX} ${SCRIPT}`, { cwd: dir, input: payload });
    const s = loadState(join(dir, 'feedback', 'state.json'));
    expect(s.rounds['1'].pushManifest).toEqual({
      pageId: '12:33',
      frames: [
        { label: 'Login', frameId: '12:34', imageHash: 'abc' },
        { label: 'Dashboard', frameId: '12:56', imageHash: 'def' },
      ],
    });
  });
});
