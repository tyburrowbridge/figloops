import { describe, it, expect } from 'vitest';
import { acquireBrowser } from '../src/browser.js';

describe('acquireBrowser (cdp)', () => {
  it('throws an actionable error when no Chrome is listening on the endpoint', async () => {
    // Port 9 (discard) is never a CDP endpoint — connect fails fast.
    await expect(
      acquireBrowser({ cdpEndpoint: 'http://127.0.0.1:9' }),
    ).rejects.toThrow(/attach to Chrome|remote-debugging-port/i);
  });
});
