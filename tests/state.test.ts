import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadState, writeState, initState, ensureRound, State } from '../src/state.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'figloops-state-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('initState', () => {
  it('creates a fresh state at currentRound=1, currentPhase=capture', () => {
    const path = join(dir, 'state.json');
    initState(path);
    const s = JSON.parse(readFileSync(path, 'utf8'));
    expect(s.schemaVersion).toBe(2);
    expect(s.currentRound).toBe(1);
    expect(s.currentPhase).toBe('capture');
    expect(s.rounds['1']).toEqual({
      captures: [],
      pushManifest: null,
      comments: [],
      themes: [],
      plan: [],
    });
  });

  it('refuses to overwrite an existing state file', () => {
    const path = join(dir, 'state.json');
    initState(path);
    expect(() => initState(path)).toThrow(/already exists/);
  });
});

describe('loadState', () => {
  it('throws a clear error if the file does not exist', () => {
    expect(() => loadState(join(dir, 'missing.json'))).toThrow(/not found/);
  });

  it('throws a clear error with field paths if JSON is malformed', () => {
    const path = join(dir, 'state.json');
    writeFileSync(path, '{ not json');
    expect(() => loadState(path)).toThrow(/Invalid JSON/);
  });

  it('throws a clear error with field paths if shape is wrong', () => {
    const path = join(dir, 'state.json');
    writeFileSync(path, JSON.stringify({ schemaVersion: 2, currentRound: 'not-a-number', currentPhase: 'capture', rounds: {} }));
    expect(() => loadState(path)).toThrow(/currentRound/);
  });

  it('round-trips a valid state', () => {
    const path = join(dir, 'state.json');
    initState(path);
    const s = loadState(path);
    expect(s.currentRound).toBe(1);
    expect(s.currentPhase).toBe('capture');
  });
});

describe('writeState', () => {
  it('serializes with 2-space indent and trailing newline', () => {
    const path = join(dir, 'state.json');
    initState(path);
    const s = loadState(path);
    writeState(path, s);
    const raw = readFileSync(path, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw).toContain('  "schemaVersion"');
  });

  it('validates before writing — rejects malformed state', () => {
    const path = join(dir, 'state.json');
    const bad = { schemaVersion: 1, currentRound: -1, currentPhase: 'capture', rounds: {} } as unknown as State;
    expect(() => writeState(path, bad)).toThrow(/currentRound/);
  });
});

describe('ensureRound', () => {
  it('adds an empty round entry if missing', () => {
    const path = join(dir, 'state.json');
    initState(path);
    const s = loadState(path);
    ensureRound(s, 2);
    expect(s.rounds['2']).toEqual({
      captures: [],
      pushManifest: null,
      comments: [],
      themes: [],
      plan: [],
    });
  });

  it('is a no-op if the round already exists', () => {
    const path = join(dir, 'state.json');
    initState(path);
    const s = loadState(path);
    s.rounds['1'].comments.push({
      id: '12',
      frameLabel: 'Login',
      authorName: 'Sarah',
      authorHandle: '@sarah',
      message: 'hi',
      createdAt: '2026-05-12T00:00:00Z',
      resolved: false,
    });
    ensureRound(s, 1);
    expect(s.rounds['1'].comments).toHaveLength(1);
  });
});

describe('Phase enum', () => {
  it('rejects unknown phases', () => {
    const path = join(dir, 'state.json');
    writeFileSync(path, JSON.stringify({
      schemaVersion: 2,
      currentRound: 1,
      currentPhase: 'bogus',
      rounds: { '1': { captures: [], pushManifest: null, comments: [], themes: [], plan: [] } },
    }));
    expect(() => loadState(path)).toThrow(/currentPhase/);
  });
});

describe('round.git', () => {
  it('round-trips an optional git block on a round', () => {
    const path = join(dir, 'state.json');
    initState(path);
    const s = loadState(path);
    s.rounds['1'].git = { branch: 'figloops/round-1-2026-05-21', baseBranch: 'main' };
    writeState(path, s);
    const reloaded = loadState(path);
    expect(reloaded.rounds['1'].git).toEqual({
      branch: 'figloops/round-1-2026-05-21',
      baseBranch: 'main',
    });
  });

  it('accepts a round without a git block', () => {
    const path = join(dir, 'state.json');
    initState(path);
    const s = loadState(path);
    expect(s.rounds['1'].git).toBeUndefined();
  });

  it('rejects a git block with empty branch name', () => {
    const path = join(dir, 'state.json');
    writeFileSync(path, JSON.stringify({
      schemaVersion: 2,
      currentRound: 1,
      currentPhase: 'capture',
      rounds: {
        '1': {
          captures: [], pushManifest: null, comments: [], themes: [], plan: [],
          git: { branch: '', baseBranch: 'main' },
        },
      },
    }));
    expect(() => loadState(path)).toThrow(/branch/);
  });
});

describe('loadState v1 → v2 auto-migration', () => {
  it('migrates and persists a v1 file on first read', () => {
    const tmp = `/tmp/figloops-state-${Date.now()}.json`;
    writeFileSync(tmp, JSON.stringify({
      schemaVersion: 1,
      currentRound: 1,
      currentPhase: 'plan-approval',
      rounds: {
        '1': {
          captures: [], pushManifest: null, comments: [], themes: [],
          plan: [{ id: 'p1', themeName: 'T', change: 'C', drivesFrom: [], status: 'approved' }],
        },
      },
    }));
    const state = loadState(tmp);
    expect(state.schemaVersion).toBe(2);
    expect(state.currentPhase).toBe('plan-ack');
    expect(state.rounds['1'].plan[0].status).toBe('pending');
    const persisted = JSON.parse(readFileSync(tmp, 'utf8'));
    expect(persisted.schemaVersion).toBe(2);
    unlinkSync(tmp);
  });
});
