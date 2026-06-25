// Shared Playwright helpers used by capture + scenario discovery.
// Browser-side snippets are kept as strings (not typed closures) so TypeScript
// doesn't type-check browser globals — the same convention as `sampleLuminance`
// in scripts/capture.ts.
import type { Page } from 'playwright';

// Wait for CSS transitions/animations to finish before screenshotting, so we
// don't capture mid-animation. Infinite loops (spinners) are ignored — they
// never finish and are part of the steady-state UI. Capped so a slow or stuck
// animation can't stall the caller.
export async function waitForAnimations(page: Page, timeoutMs = 2000): Promise<void> {
  // getAnimations() only reports animations that have already started, and a
  // fullPage screenshot scrolls the page during capture — so scroll/intersection
  // driven reveal animations would otherwise fire mid-shot. Sweep the full
  // height first to trigger them, then return to top, then settle.
  await page
    .evaluate(
      `(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const step = window.innerHeight || 600;
        const h = document.body ? document.body.scrollHeight : 0;
        for (let y = step, n = 0; y < h && n < 30; y += step, n++) {
          window.scrollTo(0, y);
          await sleep(30);
        }
        window.scrollTo(0, 0);
      })()`,
    )
    .catch(() => {});
  await page
    .waitForFunction(
      `(() => {
        const anims = document.getAnimations ? document.getAnimations() : [];
        return anims.every((a) => {
          if (a.playState === 'finished' || a.playState === 'idle') return true;
          if (!a.effect) return true; // can't reason about it — don't block
          return a.effect.getTiming().iterations === Infinity; // ignore loops
        });
      })()`,
      { timeout: timeoutMs },
    )
    .catch(() => {
      /* settle cap reached — capture anyway */
    });
}

// Browser-side source that defines `uniqueSelector(el)` → a stable CSS selector
// for an element. Concatenate this into a `page.evaluate` string, then call
// `uniqueSelector(...)`. Priority: #id → [data-testid] → tag[aria-label] →
// tag + :nth-of-type path. Returns null for non-elements.
export const UNIQUE_SELECTOR_FN = `
  function __cssAttr(s) {
    return String(s).replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"');
  }
  function uniqueSelector(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) {
      return '#' + CSS.escape(el.id);
    }
    const tid = el.getAttribute('data-testid');
    if (tid) {
      const sel = '[data-testid="' + __cssAttr(tid) + '"]';
      if (document.querySelectorAll(sel).length === 1) return sel;
    }
    const al = el.getAttribute('aria-label');
    if (al) {
      const sel = el.tagName.toLowerCase() + '[aria-label="' + __cssAttr(al) + '"]';
      if (document.querySelectorAll(sel).length === 1) return sel;
    }
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      let part = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const sibs = Array.prototype.filter.call(
          parent.children,
          (c) => c.tagName === node.tagName,
        );
        if (sibs.length > 1) part += ':nth-of-type(' + (sibs.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      if (node.id) { parts[0] = '#' + CSS.escape(node.id); break; }
      if (parts.length >= 5) break;
      node = parent;
    }
    return parts.join(' > ');
  }
`;
