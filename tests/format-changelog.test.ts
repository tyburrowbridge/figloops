import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { formatChangelog } from '../scripts/format-changelog.js';

const here = dirname(fileURLToPath(import.meta.url));
const readFixture = (name: string) => readFileSync(join(here, 'fixtures', name), 'utf8');

describe('formatChangelog', () => {
  it('produces a round summary grouped by theme', () => {
    const out = formatChangelog({
      fromRound: 2,
      toRound: 3,
      date: '2026-05-19',
      plan: readFixture('plan-sample.md'),
      addressed: readFixture('addressed-sample.md'),
    });

    expect(out).toContain('## Round 2 → Round 3 (2026-05-19)');
    expect(out).toContain('### Theme: Navigation clarity');
    expect(out).toContain('- Added breadcrumbs to Dashboard');
    expect(out).toContain('Drove from: #12, #17');
    expect(out).toContain('### Theme: Color contrast');
    expect(out).toContain('- Increased contrast on disabled buttons');
  });

  it('omits themes whose items were not addressed', () => {
    const out = formatChangelog({
      fromRound: 2,
      toRound: 3,
      date: '2026-05-19',
      plan: readFixture('plan-sample.md'),
      addressed: '- Increased contrast on disabled buttons. Drove from: #31',
    });

    expect(out).not.toContain('Navigation clarity');
    expect(out).toContain('Color contrast');
  });

  it('produces a "no changes" note when addressed.md is empty', () => {
    const out = formatChangelog({
      fromRound: 2,
      toRound: 3,
      date: '2026-05-19',
      plan: readFixture('plan-sample.md'),
      addressed: '',
    });
    expect(out).toContain('## Round 2 → Round 3 (2026-05-19)');
    expect(out).toContain('_No changes implemented this round._');
  });
});
