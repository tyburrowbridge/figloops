// Browser acquisition for capture + scenario discovery. Two modes:
//
//  - launch (default): spawn a headless Chromium. Each page gets its own fresh
//    context (isolation), optionally seeded with a storageState file for auth.
//  - cdp: attach to a Chrome the user started with --remote-debugging-port, and
//    reuse its EXISTING context so the live, already-authenticated session
//    (VPN + SSO/SAML cookies) is present. We never quit the user's Chrome.
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

export interface AcquireOptions {
  /** CDP endpoint (e.g. http://localhost:9222). When set, attach instead of launch. */
  cdpEndpoint?: string;
  /** Absolute path to a Playwright storageState file. Ignored in cdp mode. */
  storageState?: string;
}

export interface PageLease {
  page: Page;
  /** Release the page. Closes the page (and its context in launch mode). */
  release: () => Promise<void>;
}

export interface BrowserSession {
  /** Open a page sized to `viewport`, ready to navigate. */
  createPage(viewport: { width: number; height: number }): Promise<PageLease>;
  /** Tear down. Closes a launched browser; a CDP attachment is left running. */
  dispose(): Promise<void>;
}

async function acquireCdp(endpoint: string): Promise<BrowserSession> {
  let browser: Browser;
  try {
    browser = await chromium.connectOverCDP(endpoint);
  } catch (err) {
    throw new Error(
      `Couldn't attach to Chrome at ${endpoint}: ${(err as Error).message}\n` +
        `Start Chrome with the debugging port first (quit normal Chrome so the profile unlocks), e.g.:\n` +
        `  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome \\\n` +
        `    --remote-debugging-port=9222 \\\n` +
        `    --user-data-dir="$HOME/Library/Application Support/Google/Chrome"\n` +
        `Then sign in there and re-run.`,
    );
  }
  // Reuse the existing context — that's where the authenticated session lives.
  // A fresh newContext() would be blank/cookieless, defeating the point.
  const existing = browser.contexts();
  const ctx: BrowserContext = existing[0] ?? (await browser.newContext());

  return {
    async createPage(viewport) {
      const page = await ctx.newPage();
      await page.setViewportSize(viewport);
      return { page, release: async () => void (await page.close()) };
    },
    // Don't close the browser: for a CDP attachment that would shut down the
    // user's Chrome. Ending the Node process just drops the connection.
    async dispose() {},
  };
}

async function acquireLaunch(storageState?: string): Promise<BrowserSession> {
  const browser = await chromium.launch();
  return {
    async createPage(viewport) {
      const ctx = await browser.newContext({
        viewport,
        ...(storageState ? { storageState } : {}),
      });
      const page = await ctx.newPage();
      return { page, release: async () => void (await ctx.close()) };
    },
    async dispose() {
      await browser.close();
    },
  };
}

export async function acquireBrowser(opts: AcquireOptions): Promise<BrowserSession> {
  return opts.cdpEndpoint ? acquireCdp(opts.cdpEndpoint) : acquireLaunch(opts.storageState);
}
