import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { initState, loadState, writeState } from '../src/state.js';

const TSX = join(process.cwd(), 'node_modules', '.bin', 'tsx');
const SCRIPT = join(process.cwd(), 'scripts', 'update-plan.ts');

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'figloops-plan-'));
  mkdirSync(join(dir, 'feedback'));
  initState(join(dir, 'feedback', 'state.json'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('update-plan set', () => {
  it('replaces the plan for the current round', () => {
    const stdin = JSON.stringify({
      action: 'set',
      items: [
        { id: 'p1', themeName: 'Nav', change: 'breadcrumbs', drivesFrom: ['12'], status: 'pending' },
      ],
    });
    execSync(`${TSX} ${SCRIPT}`, { cwd: dir, input: stdin });
    const s = loadState(join(dir, 'feedback', 'state.json'));
    expect(s.rounds['1'].plan).toHaveLength(1);
    expect(s.rounds['1'].plan[0].change).toBe('breadcrumbs');
  });
});

describe('update-plan status', () => {
  beforeEach(() => {
    const s = loadState(join(dir, 'feedback', 'state.json'));
    s.rounds['1'].plan = [
      { id: 'p1', themeName: 'Nav', change: 'breadcrumbs', drivesFrom: ['12'], status: 'pending' },
      { id: 'p2', themeName: 'Nav', change: 'highlight', drivesFrom: ['12'], status: 'pending' },
    ];
    writeState(join(dir, 'feedback', 'state.json'), s);
  });

  it('updates a single item status', () => {
    const stdin = JSON.stringify({ action: 'status', updates: [{ id: 'p1', status: 'shipped' }] });
    execSync(`${TSX} ${SCRIPT}`, { cwd: dir, input: stdin });
    const s = loadState(join(dir, 'feedback', 'state.json'));
    expect(s.rounds['1'].plan.find((p) => p.id === 'p1')!.status).toBe('shipped');
    expect(s.rounds['1'].plan.find((p) => p.id === 'p2')!.status).toBe('pending');
  });

  it('updates multiple items in one call', () => {
    const stdin = JSON.stringify({
      action: 'status',
      updates: [
        { id: 'p1', status: 'shipped' },
        { id: 'p2', status: 'wontdo' },
      ],
    });
    execSync(`${TSX} ${SCRIPT}`, { cwd: dir, input: stdin });
    const s = loadState(join(dir, 'feedback', 'state.json'));
    expect(s.rounds['1'].plan.find((p) => p.id === 'p1')!.status).toBe('shipped');
    expect(s.rounds['1'].plan.find((p) => p.id === 'p2')!.status).toBe('wontdo');
  });

  it('errors loudly if an item id is unknown', () => {
    const stdin = JSON.stringify({ action: 'status', updates: [{ id: 'nope', status: 'pending' }] });
    expect(() => execSync(`${TSX} ${SCRIPT}`, { cwd: dir, input: stdin, stdio: 'pipe' })).toThrow();
  });
});
