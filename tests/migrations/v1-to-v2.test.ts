import { describe, it, expect } from 'vitest';
import { migrateV1ToV2 } from '../../src/migrations/v1-to-v2.js';

describe('migrateV1ToV2', () => {
  it('bumps schemaVersion 1 → 2', () => {
    const v1 = {
      schemaVersion: 1,
      currentRound: 1,
      currentPhase: 'capture',
      rounds: { '1': { captures: [], pushManifest: null, comments: [], themes: [], plan: [] } },
    };
    const v2 = migrateV1ToV2(v1);
    expect(v2.schemaVersion).toBe(2);
  });

  it('remaps phase plan-approval → plan-ack', () => {
    const v1 = {
      schemaVersion: 1,
      currentRound: 1,
      currentPhase: 'plan-approval',
      rounds: { '1': { captures: [], pushManifest: null, comments: [], themes: [], plan: [] } },
    };
    expect(migrateV1ToV2(v1).currentPhase).toBe('plan-ack');
  });

  it('remaps phase implement → plan-ack', () => {
    const v1 = {
      schemaVersion: 1,
      currentRound: 1,
      currentPhase: 'implement',
      rounds: { '1': { captures: [], pushManifest: null, comments: [], themes: [], plan: [] } },
    };
    expect(migrateV1ToV2(v1).currentPhase).toBe('plan-ack');
  });

  it.each([
    ['proposed', 'pending'],
    ['approved', 'pending'],
    ['rejected', 'wontdo'],
    ['dropped', 'wontdo'],
    ['shipped', 'shipped'],
  ])('remaps plan status %s → %s', (oldStatus, newStatus) => {
    const v1 = {
      schemaVersion: 1,
      currentRound: 1,
      currentPhase: 'capture',
      rounds: {
        '1': {
          captures: [], pushManifest: null, comments: [], themes: [],
          plan: [{ id: 'p1', themeName: 'T', change: 'C', drivesFrom: [], status: oldStatus }],
        },
      },
    };
    const v2 = migrateV1ToV2(v1);
    expect(v2.rounds['1'].plan[0].status).toBe(newStatus);
  });

  it('passes through unaffected phases', () => {
    const v1 = {
      schemaVersion: 1, currentRound: 2, currentPhase: 'cluster',
      rounds: { '2': { captures: [], pushManifest: null, comments: [], themes: [], plan: [] } },
    };
    expect(migrateV1ToV2(v1).currentPhase).toBe('cluster');
  });

  it('preserves unknown status values verbatim (forward compatibility)', () => {
    const v1 = {
      schemaVersion: 1, currentRound: 1, currentPhase: 'capture',
      rounds: {
        '1': {
          captures: [], pushManifest: null, comments: [], themes: [],
          plan: [{ id: 'p1', themeName: 'T', change: 'C', drivesFrom: [], status: 'wibble' }],
        },
      },
    };
    expect(migrateV1ToV2(v1).rounds['1'].plan[0].status).toBe('wibble');
  });

  it('preserves unknown phase values verbatim', () => {
    const v1 = {
      schemaVersion: 1, currentRound: 1, currentPhase: 'mystery-phase',
      rounds: { '1': { captures: [], pushManifest: null, comments: [], themes: [], plan: [] } },
    };
    expect(migrateV1ToV2(v1).currentPhase).toBe('mystery-phase');
  });

  it('is idempotent when run on already-v2 input', () => {
    const v2 = {
      schemaVersion: 2, currentRound: 1, currentPhase: 'plan-ack',
      rounds: {
        '1': {
          captures: [], pushManifest: null, comments: [], themes: [],
          plan: [{ id: 'p1', themeName: 'T', change: 'C', drivesFrom: [], status: 'pending' }],
        },
      },
    };
    const out = migrateV1ToV2(v2);
    expect(out.schemaVersion).toBe(2);
    expect(out.currentPhase).toBe('plan-ack');
    expect(out.rounds['1'].plan[0].status).toBe('pending');
  });

  it('tolerates rounds missing a plan array', () => {
    const v1: any = {
      schemaVersion: 1, currentRound: 1, currentPhase: 'capture',
      rounds: { '1': { captures: [], pushManifest: null, comments: [], themes: [] } },
    };
    const v2 = migrateV1ToV2(v1);
    expect(v2.rounds['1'].plan).toEqual([]);
  });

  it('preserves non-plan fields', () => {
    const v1 = {
      schemaVersion: 1, currentRound: 1, currentPhase: 'capture', uiTheme: 'dark' as const,
      rounds: {
        '1': {
          captures: [{ label: 'L', path: '/p', filename: 'f.png' }],
          pushManifest: null, comments: [], themes: [], plan: [],
        },
      },
    };
    const v2 = migrateV1ToV2(v1);
    expect(v2.uiTheme).toBe('dark');
    expect(v2.rounds['1'].captures).toEqual([{ label: 'L', path: '/p', filename: 'f.png' }]);
  });
});
