import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { configSchema } from '../src/config.js';

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
});
