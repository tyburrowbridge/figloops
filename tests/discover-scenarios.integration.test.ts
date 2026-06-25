import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, Server } from 'node:http';
import { discover, type ScenarioCandidate } from '../scripts/discover-scenarios.js';
import { mergeScenarios, type Scenario } from '../scripts/merge-scenarios.js';

let server: Server;
let port: number;

// A single page exercising every detectable interaction type plus an inert
// button that must NOT be flagged.
const PAGE = `
  <html><head><style>
    #dialog { display: none }
    #drawer { position: fixed; top: 0; right: 0; width: 300px; height: 100%; background: #fff; display: none }
    #menu { display: none }
    #sect { display: none }
  </style></head><body>
    <button id="open-dialog" onclick="document.getElementById('dialog').style.display='block'">Open dialog</button>
    <div id="dialog" role="dialog" aria-modal="true">Hello dialog</div>

    <button id="open-cart" onclick="document.getElementById('drawer').style.display='block'">Open cart</button>
    <div id="drawer">Cart drawer</div>

    <button id="open-menu" aria-haspopup="menu" aria-expanded="false"
      onclick="document.getElementById('menu').style.display='block';this.setAttribute('aria-expanded','true')">Menu</button>
    <ul id="menu" role="menu"><li role="menuitem">Item</li></ul>

    <button id="acc" aria-expanded="false" aria-controls="sect"
      onclick="document.getElementById('sect').style.display='block';this.setAttribute('aria-expanded','true')">Details</button>
    <div id="sect">Accordion body</div>

    <button id="inert">Plain action</button>
  </body></html>
`;

beforeAll(async () => {
  server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(PAGE);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      port = (server.address() as { port: number }).port;
      resolve();
    });
  });
}, 30_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function byKind(cands: ScenarioCandidate[], kind: string) {
  return cands.find((c) => c.kind === kind);
}

describe('discover-scenarios (integration)', () => {
  it('detects modal, panel, menu, and tab triggers; ignores inert buttons', async () => {
    const result = await discover({
      baseUrl: `http://localhost:${port}`,
      viewport: { width: 800, height: 600 },
      waitFor: 'load',
      routes: [{ label: 'Home', path: '/' }],
    });

    const kinds = result.candidates.map((c) => c.kind).sort();
    expect(kinds).toEqual(['menu', 'modal', 'panel', 'tab']);

    const modal = byKind(result.candidates, 'modal')!;
    expect(modal.setup).toEqual(['#open-dialog']);
    expect(modal.waitFor).toBe('#dialog');
    expect(modal.confidence).toBe('high');

    const panel = byKind(result.candidates, 'panel')!;
    expect(panel.setup).toEqual(['#open-cart']);
    expect(panel.waitFor).toBe('#drawer');

    const menu = byKind(result.candidates, 'menu')!;
    expect(menu.setup).toEqual(['#open-menu']);
    expect(menu.waitFor).toBe('#menu');

    const tab = byKind(result.candidates, 'tab')!;
    expect(tab.setup).toEqual(['#acc']);
    expect(tab.waitFor).toBe('#sect');
    expect(tab.confidence).toBe('high');

    // The inert button opened nothing → no candidate references it.
    expect(result.candidates.some((c) => c.setup.includes('#inert'))).toBe(false);
    expect(result.skipped).toHaveLength(0);
  }, 60_000);
});

describe('mergeScenarios', () => {
  const a: Scenario = { label: 'Cart — panel', path: '/', setup: ['#open-cart'] };
  const b: Scenario = { label: 'Dialog — modal', path: '/', setup: ['#open-dialog'] };

  it('adds new scenarios and dedupes by path + setup', () => {
    const { scenarios, added, skipped } = mergeScenarios([a], [b, a]);
    expect(added).toBe(1);
    expect(skipped).toBe(1);
    expect(scenarios).toHaveLength(2);
    expect(scenarios.map((s) => s.label)).toEqual(['Cart — panel', 'Dialog — modal']);
  });

  it('treats different setup on the same path as distinct', () => {
    const variant: Scenario = { label: 'Cart deep', path: '/', setup: ['#open-cart', '#tab-2'] };
    const { added } = mergeScenarios([a], [variant]);
    expect(added).toBe(1);
  });
});
