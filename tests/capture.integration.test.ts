import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, Server } from 'node:http';
import { mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { capture } from '../scripts/capture.js';

let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    if (req.url === '/login') {
      res.end('<html><body style="background:#f0a"><h1>Login</h1></body></html>');
    } else if (req.url === '/dashboard') {
      res.end('<html><body style="background:#0af"><h1>Dashboard</h1></body></html>');
    } else {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      port = (server.address() as any).port;
      resolve();
    });
  });
}, 30_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('capture (integration)', () => {
  it('captures all routes and writes PNGs', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'fb-cap-'));
    try {
      const result = await capture({
        outputDir: outDir,
        viewport: { width: 800, height: 600 },
        baseUrl: `http://localhost:${port}`,
        waitFor: 'load',
        routes: [
          { label: 'Login',     path: '/login' },
          { label: 'Dashboard', path: '/dashboard' },
        ],
      });

      expect(result.captures).toHaveLength(2);
      expect(result.captures[0].path).toMatch(/01-login\.png$/);
      expect(result.captures[0].filename).toBe('01-login.png');
      expect(result.captures[1].path).toMatch(/02-dashboard\.png$/);
      expect(result.captures[1].filename).toBe('02-dashboard.png');

      for (const c of result.captures) {
        expect(statSync(c.path).size).toBeGreaterThan(0);
      }
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 60_000);
});
