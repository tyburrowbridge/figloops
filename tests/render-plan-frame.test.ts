import { describe, it, expect } from 'vitest';
import { buildPlanFramePayload, applyPlanFrameResult } from '../scripts/render-plan-frame.js';
import type { State } from '../src/state.js';

function makeState(planItems: Array<{ id: string; change: string; themeName: string }>): State {
  return {
    schemaVersion: 2,
    currentRound: 1,
    currentPhase: 'plan-ack',
    rounds: {
      '1': {
        captures: [],
        pushManifest: null,
        comments: [],
        themes: [],
        plan: planItems.map((p) => ({
          ...p,
          drivesFrom: [],
          status: 'pending' as const,
        })),
      },
    },
  };
}

describe('buildPlanFramePayload', () => {
  it('emits one row per plan item with sequential y-coords', () => {
    const state = makeState([
      { id: 'p1', change: 'Add breadcrumbs', themeName: 'Nav' },
      { id: 'p2', change: 'Bigger CTA', themeName: 'Hero' },
    ]);
    const payload = buildPlanFramePayload(state, { round: 1, pageName: 'Plan — Round 1' });
    expect(payload).toContain('Plan — Round 1');
    expect(payload).toContain('Add breadcrumbs');
    expect(payload).toContain('Bigger CTA');
    expect(payload).toContain('"id":"p1"');
    expect(payload).toContain('"id":"p2"');
  });

  it('escapes backticks and dollar signs in change text', () => {
    const state = makeState([{ id: 'p1', change: 'Fix `code` and ${var}', themeName: 'T' }]);
    const payload = buildPlanFramePayload(state, { round: 1, pageName: 'P' });
    expect(payload).not.toMatch(/`code`/);
    expect(payload).toContain('\\`code\\`');
    expect(payload).toContain('\\${var}');
  });
});

describe('applyPlanFrameResult', () => {
  it('writes planFrame and per-item rowIndex back to state', () => {
    const state = makeState([
      { id: 'p1', change: 'A', themeName: 'T' },
      { id: 'p2', change: 'B', themeName: 'T' },
    ]);
    const result = {
      pageId: 'page-1',
      frameId: 'frame-1',
      frameName: 'Plan — Round 1',
      rows: [
        { itemId: 'p1', index: 0 },
        { itemId: 'p2', index: 1 },
      ],
    };
    const next = applyPlanFrameResult(state, 1, result);
    expect(next.rounds['1'].planFrame).toEqual({
      pageId: 'page-1', frameId: 'frame-1', frameName: 'Plan — Round 1',
    });
    expect(next.rounds['1'].plan[0].rowIndex).toBe(0);
    expect(next.rounds['1'].plan[1].rowIndex).toBe(1);
  });
});
