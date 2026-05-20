import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { initState, loadState } from '../src/state.js';

const TSX = join(process.cwd(), 'node_modules', '.bin', 'tsx');
const SCRIPT = join(process.cwd(), 'scripts', 'advance-phase.ts');

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'figloops-advance-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('advance-phase', () => {
  it('transitions to the named phase', () => {
    const statePath = join(dir, 'feedback', 'state.json');
    initState(statePath);
    execSync(`${TSX} ${SCRIPT} push`, { cwd: dir });
    const s = loadState(statePath);
    expect(s.currentPhase).toBe('push');
  });

  it('bumps currentRound and ensures new round entry when advancing to capture from close', () => {
    const statePath = join(dir, 'feedback', 'state.json');
    initState(statePath);
    // Manually move to close (the realistic precondition)
    execSync(`${TSX} ${SCRIPT} close`, { cwd: dir });
    execSync(`${TSX} ${SCRIPT} capture`, { cwd: dir });
    const s = loadState(statePath);
    expect(s.currentRound).toBe(2);
    expect(s.currentPhase).toBe('capture');
    expect(s.rounds['2']).toBeDefined();
  });

  it('rejects an unknown phase', () => {
    const statePath = join(dir, 'feedback', 'state.json');
    initState(statePath);
    expect(() => execSync(`${TSX} ${SCRIPT} bogus`, { cwd: dir, stdio: 'pipe' })).toThrow();
  });
});
