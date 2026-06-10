import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pullPlanStates, parseItemStatus } from '../scripts/pull-plan-states.js';
import type { FigmaComment } from '../src/figma-client.js';

function thread(id: string, resolved: boolean, replies: Array<{ msg: string; at: string }>): FigmaComment {
  return {
    id, message: 'anchor', nodeId: null, authorName: 'bot', authorHandle: 'bot',
    createdAt: '2026-06-09T10:00:00Z', resolved, parentId: null,
    replies: replies.map((r, i) => ({
      id: `${id}-r${i}`, message: r.msg, nodeId: null, authorName: 'u', authorHandle: 'u',
      createdAt: r.at, resolved: false, parentId: id, replies: [],
    })),
  };
}

describe('parseItemStatus', () => {
  it('returns shipped when thread is resolved and no /skip reply', () => {
    expect(parseItemStatus(thread('c1', true, []))).toBe('shipped');
  });

  it('returns wontdo when latest /skip reply exists, even if resolved', () => {
    const t = thread('c1', true, [
      { msg: 'discussion', at: '2026-06-09T10:00:00Z' },
      { msg: '/skip', at: '2026-06-09T11:00:00Z' },
    ]);
    expect(parseItemStatus(t)).toBe('wontdo');
  });

  it('returns pending when open and no /skip reply', () => {
    expect(parseItemStatus(thread('c1', false, [{ msg: 'hi', at: '2026-06-09T10:00:00Z' }]))).toBe('pending');
  });

  it('matches /skip case-insensitively', () => {
    expect(parseItemStatus(thread('c1', false, [{ msg: '/SKIP', at: 'x' }]))).toBe('wontdo');
    expect(parseItemStatus(thread('c1', false, [{ msg: '/Skip extra', at: 'x' }]))).toBe('wontdo');
  });

  it('ignores /skip embedded in longer text not at start', () => {
    expect(parseItemStatus(thread('c1', false, [{ msg: 'please /skip this', at: 'x' }]))).toBe('pending');
  });

  it('any /skip reply in thread wins (latest /skip wins per parse rule)', () => {
    const t = thread('c1', false, [
      { msg: '/skip', at: '2026-06-09T10:00:00Z' },
      { msg: 'oops nevermind', at: '2026-06-09T11:00:00Z' },
    ]);
    expect(parseItemStatus(t)).toBe('wontdo');
  });
});

describe('pullPlanStates', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns delta keyed by item id', async () => {
    (fetch as any).mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        comments: [
          { id: 'c1', message: 'anchor', user: { handle: 'b', id: 'bid' }, created_at: '2026-06-09T10:00:00Z', resolved_at: '2026-06-09T12:00:00Z' },
          { id: 'c2', message: 'anchor', user: { handle: 'b', id: 'bid' }, created_at: '2026-06-09T10:00:00Z', resolved_at: null },
          { id: 'c2-r', message: '/skip', user: { handle: 'u', id: 'uid' }, created_at: '2026-06-09T11:00:00Z', resolved_at: null, parent_id: 'c2' },
          { id: 'c3', message: 'anchor', user: { handle: 'b', id: 'bid' }, created_at: '2026-06-09T10:00:00Z', resolved_at: null },
        ],
      }),
    });
    const result = await pullPlanStates({
      fileKey: 'k', token: 't',
      items: [
        { id: 'p1', commentId: 'c1', currentStatus: 'pending' },
        { id: 'p2', commentId: 'c2', currentStatus: 'pending' },
        { id: 'p3', commentId: 'c3', currentStatus: 'pending' },
        { id: 'p4', commentId: 'missing', currentStatus: 'pending' },
      ],
    });
    expect(result.statuses).toEqual({ p1: 'shipped', p2: 'wontdo', p3: 'pending', p4: 'removed' });
    expect(result.delta.shipped).toEqual(['p1']);
    expect(result.delta.wontdo).toEqual(['p2']);
    expect(result.delta.pending).toEqual(['p3']);
    expect(result.delta.removed).toEqual(['p4']);
  });
});
