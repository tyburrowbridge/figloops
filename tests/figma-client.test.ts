import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uploadImage } from '../src/figma-client.js';

describe('uploadImage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to the correct URL with token header', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ meta: { images: { 'login.png': 'hash-abc' } } }),
    });

    await uploadImage({
      fileKey: 'abc123',
      token: 'tok',
      filename: 'login.png',
      bytes: Buffer.from([0x89, 0x50]),
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe('https://api.figma.com/v1/images/abc123');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Figma-Token']).toBe('tok');
  });

  it('returns the image hash on success', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ meta: { images: { 'login.png': 'hash-abc' } } }),
    });

    const hash = await uploadImage({
      fileKey: 'abc123',
      token: 'tok',
      filename: 'login.png',
      bytes: Buffer.from([0x89]),
    });

    expect(hash).toBe('hash-abc');
  });

  it('throws with status and body on 4xx', async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden: bad token',
    });

    await expect(
      uploadImage({
        fileKey: 'abc123',
        token: 'bad',
        filename: 'x.png',
        bytes: Buffer.from([0]),
      }),
    ).rejects.toThrowError(/403.*Forbidden/);
  });
});
