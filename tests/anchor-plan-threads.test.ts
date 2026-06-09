import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { anchorPlanThreads, BOT_REMINDER } from '../scripts/anchor-plan-threads.js';
import type { State } from '../src/state.js';

function makeState(): State {
  return {
    schemaVersion: 2,
    currentRound: 1,
    currentPhase: 'plan-ack',
    rounds: {
      '1': {
        captures: [], pushManifest: null, comments: [], themes: [],
        plan: [
          { id: 'p1', themeName: 'T', change: 'A', drivesFrom: [], status: 'pending', rowIndex: 0 },
          { id: 'p2', themeName: 'T', change: 'B', drivesFrom: [], status: 'pending', rowIndex: 1 },
        ],
        planFrame: { pageId: 'pg', frameId: 'fr', frameName: 'Plan — Round 1' },
      },
    },
  };
}

describe('anchorPlanThreads', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('POSTs one anchor + one bot reply per plan item and returns updated state', async () => {
    const ids = ['anchor-1', 'reply-1', 'anchor-2', 'reply-2'];
    let i = 0;
    (fetch as any).mockImplementation(async () => ({
      ok: true, status: 200, json: async () => ({ id: ids[i++] }),
    }));
    const next = await anchorPlanThreads({ state: makeState(), round: 1, fileKey: 'k', token: 't' });
    expect((fetch as any).mock.calls.length).toBe(4);
    expect(next.rounds['1'].plan[0].commentId).toBe('anchor-1');
    expect(next.rounds['1'].plan[0].botReplyId).toBe('reply-1');
    expect(next.rounds['1'].plan[1].commentId).toBe('anchor-2');
    expect(next.rounds['1'].plan[1].botReplyId).toBe('reply-2');
  });

  it('bot reminder text contains /skip token and resolve hint', () => {
    expect(BOT_REMINDER).toContain('/skip');
    expect(BOT_REMINDER).toContain('✓');
  });

  it('throws if planFrame is missing', async () => {
    const s = makeState();
    delete s.rounds['1'].planFrame;
    await expect(
      anchorPlanThreads({ state: s, round: 1, fileKey: 'k', token: 't' })
    ).rejects.toThrow(/planFrame/);
  });
});
