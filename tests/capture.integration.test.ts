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
    } else if (req.url === '/search') {
      // Search form: results render only after typing a value and clicking
      // Search — exercises fill + click setup steps for a results state.
      res.end(`
        <html><body>
          <input id="q" placeholder="Enter value and press Search..." />
          <button id="go" onclick="document.getElementById('results').style.display = document.getElementById('q').value ? 'block' : 'none'">Search</button>
          <div id="results" style="display:none;background:#efe;padding:20px">31 records</div>
        </body></html>
      `);
    } else if (req.url === '/animated') {
      // Finite entrance animation — waitForAnimations should block until it ends.
      res.end(`
        <html><head><style>
          @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
          #box { animation: fade 600ms ease forwards; background:#9cf; padding:40px }
        </style></head><body><div id="box">Faded in</div></body></html>
      `);
    } else if (req.url === '/spinner') {
      // Infinite loop — waitForAnimations should ignore it and not stall.
      res.end(`
        <html><head><style>
          @keyframes spin { to { transform: rotate(360deg) } }
          #s { animation: spin 600ms linear infinite; width:40px; height:40px; background:#f90 }
        </style></head><body><div id="s"></div></body></html>
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
      expect(result.captures[0].path).toMatch(/01-login\.jpg$/);
      expect(result.captures[0].filename).toBe('01-login.jpg');
      expect(result.captures[1].path).toMatch(/02-dashboard\.jpg$/);
      expect(result.captures[1].filename).toBe('02-dashboard.jpg');

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
      expect(result.captures[0].filename).toBe('01-login.jpg');
      expect(result.captures[1].filename).toBe('02-sign-up-modal.jpg');
      expect(statSync(result.captures[1].path).size).toBeGreaterThan(0);
      expect(result.failed).toHaveLength(0);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('fills an input then clicks to capture a results state', async () => {
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
            label: 'Search results',
            path: '/search',
            setup: [
              { action: 'fill', selector: '#q', value: 'VP-BGT' },
              { action: 'click', selector: '#go' },
            ],
            waitFor: '#results[style*="display:block"], #results[style*="display: block"]',
          },
        ],
      });

      expect(result.failed).toHaveLength(0);
      expect(result.captures).toHaveLength(2);
      expect(result.captures[1].filename).toBe('02-search-results.jpg');
      expect(statSync(result.captures[1].path).size).toBeGreaterThan(0);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('waits for a finite entrance animation to finish before capturing', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'fb-cap-'));
    try {
      const start = performance.now();
      const result = await capture({
        outputDir: outDir,
        viewport: { width: 800, height: 600 },
        baseUrl: `http://localhost:${port}`,
        waitFor: 'load',
        routes: [{ label: 'Animated', path: '/animated' }],
      });
      const elapsed = performance.now() - start;

      expect(result.captures).toHaveLength(1);
      // The 600ms animation must have been awaited (well under the 2s cap).
      expect(elapsed).toBeGreaterThan(500);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('does not stall on an infinite (looping) animation', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'fb-cap-'));
    try {
      const start = performance.now();
      const result = await capture({
        outputDir: outDir,
        viewport: { width: 800, height: 600 },
        baseUrl: `http://localhost:${port}`,
        waitFor: 'load',
        routes: [{ label: 'Spinner', path: '/spinner' }],
      });
      const elapsed = performance.now() - start;

      expect(result.captures).toHaveLength(1);
      // Looping animation is ignored — capture must not wait the full 2s cap.
      // (Blocked would be ≥2000ms; bound leaves headroom for CI CPU contention.)
      expect(elapsed).toBeLessThan(1800);
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
