import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanupBotReplies } from '../scripts/cleanup-bot-replies.js';
import type { State } from '../src/state.js';

function makeState(replies: Array<string | undefined>): State {
  return {
    schemaVersion: 2,
    currentRound: 1,
    currentPhase: 'close',
    rounds: {
      '1': {
        captures: [], pushManifest: null, comments: [], themes: [],
        plan: replies.map((r, i) => ({
          id: `p${i}`, themeName: 'T', change: 'C', drivesFrom: [],
          status: 'shipped' as const, botReplyId: r,
        })),
      },
    },
  };
}

describe('cleanupBotReplies', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('DELETEs every botReplyId present', async () => {
    (fetch as any).mockResolvedValue({ ok: true, status: 200 });
    await cleanupBotReplies({ state: makeState(['r1', 'r2', undefined, 'r3']), round: 1, fileKey: 'k', token: 't' });
    expect((fetch as any).mock.calls.length).toBe(3);
  });

  it('does not throw when there are no replies', async () => {
    await expect(cleanupBotReplies({ state: makeState([]), round: 1, fileKey: 'k', token: 't' })).resolves.toBeUndefined();
  });

  it('tolerates 404 from already-deleted replies', async () => {
    (fetch as any).mockResolvedValue({ ok: false, status: 404, text: async () => 'gone' });
    await expect(cleanupBotReplies({ state: makeState(['r1']), round: 1, fileKey: 'k', token: 't' })).resolves.toBeUndefined();
  });
});
