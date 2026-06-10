import { describe, it, expect } from 'vitest';
import { formatChangelog } from '../scripts/format-changelog.js';
import type { RoundData } from '../src/state.js';

const sampleRound: RoundData = {
  captures: [],
  pushManifest: null,
  comments: [
    { id: '12', frameLabel: 'Login', authorName: 'Sarah Lee', authorHandle: '@sarah', message: '', createdAt: '2026-05-14T00:00:00Z', resolved: false },
    { id: '17', frameLabel: 'Login', authorName: 'Mike Chen', authorHandle: '@mike', message: '', createdAt: '2026-05-14T00:00:00Z', resolved: false },
    { id: '23', frameLabel: 'Dashboard', authorName: 'Sarah Lee', authorHandle: '@sarah', message: '', createdAt: '2026-05-14T00:00:00Z', resolved: false },
  ],
  themes: [
    { name: 'Navigation clarity', commentIds: ['12', '17'], summary: '' },
    { name: 'Color contrast', commentIds: ['23'], summary: '' },
  ],
  plan: [
    { id: 'p1', themeName: 'Navigation clarity', change: 'Add breadcrumbs', drivesFrom: ['12', '17'], status: 'shipped' },
    { id: 'p2', themeName: 'Navigation clarity', change: 'Highlight nav', drivesFrom: ['12'], status: 'pending' },
    { id: 'p3', themeName: 'Color contrast', change: 'Increase contrast', drivesFrom: ['23'], status: 'shipped' },
    { id: 'p4', themeName: 'Color contrast', change: 'Rejected idea', drivesFrom: ['23'], status: 'wontdo' },
  ],
};

describe('formatChangelog', () => {
  it('renders shipped items grouped by theme', () => {
    const md = formatChangelog({ fromRound: 2, toRound: 3, date: '2026-05-20', round: sampleRound });
    expect(md).toContain('## Round 2 → Round 3 (2026-05-20)');
    expect(md).toContain('### Theme: Navigation clarity');
    expect(md).toContain('- Add breadcrumbs');
    expect(md).toContain('### Theme: Color contrast');
    expect(md).toContain('- Increase contrast');
  });

  it('cites drivers by author name', () => {
    const md = formatChangelog({ fromRound: 2, toRound: 3, date: '2026-05-20', round: sampleRound });
    expect(md).toMatch(/Sarah Lee \(#12\)/);
    expect(md).toMatch(/Mike Chen \(#17\)/);
  });

  it('omits non-shipped items (pending/wontdo/removed)', () => {
    const md = formatChangelog({ fromRound: 2, toRound: 3, date: '2026-05-20', round: sampleRound });
    expect(md).not.toContain('Highlight nav');
    expect(md).not.toContain('Rejected idea');
  });

  it('returns the "feedback not actionable" stub when no items shipped', () => {
    const empty: RoundData = { ...sampleRound, plan: sampleRound.plan.map((p) => ({ ...p, status: 'wontdo' })) };
    const md = formatChangelog({ fromRound: 2, toRound: 3, date: '2026-05-20', round: empty });
    expect(md).toContain('feedback not actionable');
  });

  it('returns "no changes implemented" when plan was empty', () => {
    const empty: RoundData = { ...sampleRound, plan: [] };
    const md = formatChangelog({ fromRound: 2, toRound: 3, date: '2026-05-20', round: empty });
    expect(md).toContain('No changes implemented');
  });
});
