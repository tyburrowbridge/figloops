import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { probeRoutes } from '../scripts/probe-routes.js';

describe('probeRoutes', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockResponses(map: Record<string, { ok: boolean; status: number; text?: string; url?: string }>) {
    (fetch as any).mockImplementation((input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      const r = map[url];
      if (!r) return Promise.reject(new Error(`unmocked: ${url}`));
      return Promise.resolve({
        ok: r.ok,
        status: r.status,
        url: r.url ?? url,
        text: async () => r.text ?? '',
      });
    });
  }

  it('marks reachable routes with 2xx as reachable=true', async () => {
    mockResponses({
      'http://localhost:3000/': { ok: true, status: 200, text: '<html></html>' },
      'http://localhost:3000/login': { ok: true, status: 200 },
    });

    const result = await probeRoutes({
      baseUrl: 'http://localhost:3000',
      routes: [{ label: 'Login', path: '/login' }],
    });

    expect(result.routes[0].reachable).toBe(true);
    expect(result.routes[0].status).toBe(200);
  });

  it('marks 404 routes as unreachable (likely stale)', async () => {
    mockResponses({
      'http://localhost:3000/': { ok: true, status: 200, text: '<html></html>' },
      'http://localhost:3000/deprecated': { ok: false, status: 404 },
    });

    const result = await probeRoutes({
      baseUrl: 'http://localhost:3000',
      routes: [{ label: 'Deprecated', path: '/deprecated' }],
    });

    expect(result.routes[0].reachable).toBe(false);
    expect(result.routes[0].status).toBe(404);
  });

  it('records finalUrl when the server redirects', async () => {
    mockResponses({
      'http://localhost:3000/': { ok: true, status: 200, text: '<html></html>' },
      'http://localhost:3000/old': { ok: true, status: 200, url: 'http://localhost:3000/new' },
    });

    const result = await probeRoutes({
      baseUrl: 'http://localhost:3000',
      routes: [{ label: 'Old', path: '/old' }],
    });

    expect(result.routes[0].reachable).toBe(true);
    expect(result.routes[0].finalUrl).toBe('http://localhost:3000/new');
  });

  it('marks routes unreachable + records error on connection failure', async () => {
    (fetch as any).mockImplementation((input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === 'http://localhost:3000/') {
        return Promise.resolve({ ok: true, status: 200, url, text: async () => '<html></html>' });
      }
      return Promise.reject(new Error('ECONNREFUSED'));
    });

    const result = await probeRoutes({
      baseUrl: 'http://localhost:3000',
      routes: [{ label: 'Login', path: '/login' }],
    });

    expect(result.routes[0].reachable).toBe(false);
    expect(result.routes[0].status).toBeNull();
    expect(result.routes[0].error).toMatch(/ECONNREFUSED/);
  });

  it('reports serverReachable=false when entry page connection fails', async () => {
    (fetch as any).mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await probeRoutes({
      baseUrl: 'http://localhost:3000',
      routes: [{ label: 'Login', path: '/login' }],
    });

    expect(result.serverReachable).toBe(false);
    expect(result.entryLinks).toEqual([]);
    expect(result.routes[0].reachable).toBe(false);
  });

  it('extracts internal <a href> links from entry page and flags linkedFromEntry', async () => {
    mockResponses({
      'http://localhost:3000/': {
        ok: true,
        status: 200,
        text: `
          <html><body>
            <a href="/login">Login</a>
            <a href='/dashboard'>Dashboard</a>
            <a href="https://external.com/page">External</a>
            <a href="#hash">Anchor</a>
          </body></html>
        `,
      },
      'http://localhost:3000/login': { ok: true, status: 200 },
      'http://localhost:3000/dashboard': { ok: true, status: 200 },
      'http://localhost:3000/orphan': { ok: true, status: 200 },
    });

    const result = await probeRoutes({
      baseUrl: 'http://localhost:3000',
      routes: [
        { label: 'Login', path: '/login' },
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Orphan', path: '/orphan' },
      ],
    });

    expect(result.entryLinks).toContain('/login');
    expect(result.entryLinks).toContain('/dashboard');
    expect(result.entryLinks).not.toContain('/orphan');
    // External + hash-only links are filtered out
    expect(result.entryLinks.some((l) => l.startsWith('http'))).toBe(false);

    expect(result.routes.find((r) => r.path === '/login')?.linkedFromEntry).toBe(true);
    expect(result.routes.find((r) => r.path === '/dashboard')?.linkedFromEntry).toBe(true);
    expect(result.routes.find((r) => r.path === '/orphan')?.linkedFromEntry).toBe(false);
  });

  it('treats trailing-slash variants as the same path when comparing to entry links', async () => {
    mockResponses({
      'http://localhost:3000/': {
        ok: true,
        status: 200,
        text: '<a href="/about/">About</a>',
      },
      'http://localhost:3000/about': { ok: true, status: 200 },
    });

    const result = await probeRoutes({
      baseUrl: 'http://localhost:3000',
      routes: [{ label: 'About', path: '/about' }],
    });

    expect(result.routes[0].linkedFromEntry).toBe(true);
  });
});
