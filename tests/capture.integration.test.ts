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
    } else if (req.url === '/') {
      // Page with a button that opens a "modal" (just toggles a div) — used by
      // the scenarios test to exercise setup-click + screenshot.
      res.end(`
        <html><body>
          <button id="open-modal" onclick="document.getElementById('modal').style.display='block'">Open modal</button>
          <div id="modal" role="dialog" style="display:none;background:#9f9;padding:40px">Hello modal</div>
        </body></html>
      `);
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

  it('runs scenario setup clicks before capturing and waits for waitFor', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'fb-cap-'));
    try {
      const result = await capture({
        outputDir: outDir,
        viewport: { width: 800, height: 600 },
        baseUrl: `http://localhost:${port}`,
        waitFor: 'load',
        routes: [{ label: 'Login', path: '/login' }],
        scenarios: [
          {
            label: 'Sign up modal',
            path: '/',
            setup: ['#open-modal'],
            waitFor: '#modal[style*="display:block"], #modal[style*="display: block"]',
          },
        ],
      });

      // Numbered across routes + scenarios in one list.
      expect(result.captures).toHaveLength(2);
      expect(result.captures[0].filename).toBe('01-login.png');
      expect(result.captures[1].filename).toBe('02-sign-up-modal.png');
      expect(statSync(result.captures[1].path).size).toBeGreaterThan(0);
      expect(result.failed).toHaveLength(0);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('records a scenario as failed (not aborted) when its setup selector is missing', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'fb-cap-'));
    try {
      const result = await capture({
        outputDir: outDir,
        viewport: { width: 800, height: 600 },
        baseUrl: `http://localhost:${port}`,
        waitFor: 'load',
        routes: [{ label: 'Login', path: '/login' }],
        scenarios: [
          {
            label: 'Nonexistent',
            path: '/',
            setup: ['#this-button-does-not-exist'],
          },
        ],
      });

      // The route still captured; the scenario failed gracefully.
      expect(result.captures).toHaveLength(1);
      expect(result.captures[0].label).toBe('Login');
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].label).toBe('Nonexistent');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 60_000);
});
