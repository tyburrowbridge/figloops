import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { initState, loadState } from '../src/state.js';

const TSX = join(process.cwd(), 'node_modules', '.bin', 'tsx');
const SCRIPT = join(process.cwd(), 'scripts', 'set-themes.ts');

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'figloops-themes-'));
  mkdirSync(join(dir, 'feedback'));
  initState(join(dir, 'feedback', 'state.json'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('set-themes', () => {
  it('stores themes into state.json for the current round', () => {
    const payload = JSON.stringify([
      { name: 'Navigation clarity', commentIds: ['12', '17'], summary: 'orient struggles' },
      { name: 'Color contrast', commentIds: ['23'], summary: 'secondary too light' },
    ]);
    execSync(`${TSX} ${SCRIPT}`, { cwd: dir, input: payload });
    const s = loadState(join(dir, 'feedback', 'state.json'));
    expect(s.rounds['1'].themes).toEqual([
      { name: 'Navigation clarity', commentIds: ['12', '17'], summary: 'orient struggles' },
      { name: 'Color contrast', commentIds: ['23'], summary: 'secondary too light' },
    ]);
  });
});
