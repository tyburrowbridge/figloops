import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { configSchema, loadConfig } from '../src/config.js';

const here = dirname(fileURLToPath(import.meta.url));
const readFixture = (name: string) =>
  JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8'));

describe('configSchema', () => {
  it('accepts a fully populated valid config', () => {
    const data = readFixture('valid-config.json');
    const result = configSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('accepts config when route.waitFor is omitted', () => {
    const data = readFixture('valid-config.json');
    delete data.routes[0].waitFor;
    expect(configSchema.safeParse(data).success).toBe(true);
  });

  it('rejects config with missing routes field', () => {
    const data = readFixture('invalid-config-missing-routes.json');
    const result = configSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('routes');
    }
  });

  it('rejects routes with a path that does not start with /', () => {
    const data = readFixture('valid-config.json');
    data.routes[0].path = 'login';
    const result = configSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects empty routes array', () => {
    const data = readFixture('valid-config.json');
    data.routes = [];
    expect(configSchema.safeParse(data).success).toBe(false);
  });

  it('accepts config with no git block (backwards compatible)', () => {
    const data = readFixture('valid-config.json');
    expect(data.git).toBeUndefined();
    expect(configSchema.safeParse(data).success).toBe(true);
  });

  it('accepts git.branchPerRound of "ask", "always", or "never"', () => {
    const data = readFixture('valid-config.json');
    for (const mode of ['ask', 'always', 'never'] as const) {
      data.git = { branchPerRound: mode };
      expect(configSchema.safeParse(data).success).toBe(true);
    }
  });

  it('rejects an unknown git.branchPerRound value', () => {
    const data = readFixture('valid-config.json');
    data.git = { branchPerRound: 'sometimes' };
    expect(configSchema.safeParse(data).success).toBe(false);
  });

  it('accepts config with no scenarios block (backwards compatible)', () => {
    const data = readFixture('valid-config.json');
    expect(data.scenarios).toBeUndefined();
    expect(configSchema.safeParse(data).success).toBe(true);
  });

  it('accepts a scenario with label + path only', () => {
    const data = readFixture('valid-config.json');
    data.scenarios = [{ label: 'Sign up modal', path: '/' }];
    expect(configSchema.safeParse(data).success).toBe(true);
  });

  it('accepts a scenario with setup selectors + waitFor', () => {
    const data = readFixture('valid-config.json');
    data.scenarios = [
      { label: 'Sign up modal', path: '/', setup: ['[data-testid=open-signup]'], waitFor: '[role=dialog]' },
    ];
    expect(configSchema.safeParse(data).success).toBe(true);
  });

  it('rejects scenario path that does not start with /', () => {
    const data = readFixture('valid-config.json');
    data.scenarios = [{ label: 'X', path: 'login' }];
    expect(configSchema.safeParse(data).success).toBe(false);
  });

  it('rejects scenario with empty setup selector', () => {
    const data = readFixture('valid-config.json');
    data.scenarios = [{ label: 'X', path: '/', setup: [''] }];
    expect(configSchema.safeParse(data).success).toBe(false);
  });

  it('accepts mixed setup steps (string click + fill/press/select objects)', () => {
    const data = readFixture('valid-config.json');
    data.scenarios = [
      {
        label: 'Search results',
        path: '/logs',
        setup: [
          { action: 'fill', selector: '#q', value: 'VP-BGT' },
          { action: 'press', selector: '#q', key: 'Enter' },
          { action: 'select', selector: '#type', value: 'AES' },
          '#search-btn',
        ],
        waitFor: 'table tbody tr',
      },
    ];
    expect(configSchema.safeParse(data).success).toBe(true);
  });

  it('rejects a fill step missing its value', () => {
    const data = readFixture('valid-config.json');
    data.scenarios = [{ label: 'X', path: '/', setup: [{ action: 'fill', selector: '#q' }] }];
    expect(configSchema.safeParse(data).success).toBe(false);
  });
});

describe('loadConfig', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fb-cfg-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('loads and validates a valid config file', () => {
    const data = readFixture('valid-config.json');
    const path = join(dir, 'figloops.config.json');
    writeFileSync(path, JSON.stringify(data));
    const cfg = loadConfig(path);
    expect(cfg.routes).toHaveLength(2);
    expect(cfg.devServer.waitFor).toBe('networkidle');
  });

  it('throws a clear error with field paths when invalid', () => {
    const data = readFixture('invalid-config-missing-routes.json');
    const path = join(dir, 'bad.json');
    writeFileSync(path, JSON.stringify(data));
    expect(() => loadConfig(path)).toThrowError(/routes/);
  });

  it('throws if the file is missing', () => {
    expect(() => loadConfig(join(dir, 'nope.json'))).toThrowError(/ENOENT|not found/i);
  });

  it('throws a clear error when the file contains malformed JSON', () => {
    const path = join(dir, 'bad-json.json');
    writeFileSync(path, '{ this is not valid json');
    expect(() => loadConfig(path)).toThrowError(/Invalid JSON in config/);
  });
});
