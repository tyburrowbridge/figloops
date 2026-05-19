import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export interface RoundState {
  currentRound: number;
}

export function readRoundState(path: string): RoundState {
  if (!existsSync(path)) {
    throw new Error(`Round state file not found at ${path}. Run /figma-feedback-init first.`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as RoundState;
}

export function writeRoundState(path: string, state: RoundState): void {
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
}

export function initRoundState(path: string): void {
  if (existsSync(path)) {
    throw new Error(`Round state file already exists at ${path}; refusing to overwrite.`);
  }
  writeRoundState(path, { currentRound: 1 });
}

export function bumpRound(path: string): number {
  const state = readRoundState(path);
  const next = { currentRound: state.currentRound + 1 };
  writeRoundState(path, next);
  return next.currentRound;
}
