import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readRoundState,
  writeRoundState,
  bumpRound,
  initRoundState,
} from '../src/round-state.js';

describe('round-state', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fb-rs-'));
    path = join(dir, '.round-state.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('initRoundState creates file with currentRound: 1', () => {
    initRoundState(path);
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ currentRound: 1 });
  });

  it('initRoundState refuses to overwrite an existing file', () => {
    writeFileSync(path, JSON.stringify({ currentRound: 5 }));
    expect(() => initRoundState(path)).toThrowError(/already exists/);
  });

  it('readRoundState returns the current round', () => {
    writeFileSync(path, JSON.stringify({ currentRound: 7 }));
    expect(readRoundState(path)).toEqual({ currentRound: 7 });
  });

  it('readRoundState throws if file missing', () => {
    expect(() => readRoundState(path)).toThrowError(/not found|ENOENT/i);
  });

  it('writeRoundState writes to disk', () => {
    writeRoundState(path, { currentRound: 3 });
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ currentRound: 3 });
  });

  it('bumpRound increments and persists', () => {
    writeFileSync(path, JSON.stringify({ currentRound: 2 }));
    const next = bumpRound(path);
    expect(next).toBe(3);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ currentRound: 3 });
  });
});
