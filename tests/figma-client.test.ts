import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { uploadImage, fetchComments, filterCommentsByFrameIds, getMe, getFile } from '../src/figma-client.js';

const here = dirname(fileURLToPath(import.meta.url));
const readFixture = (name: string) =>
  JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8'));

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

  it('retries on 5xx and succeeds if a later attempt works', async () => {
    let calls = 0;
    (fetch as any).mockImplementation(() => {
      calls++;
      if (calls < 3) {
        return Promise.resolve({
          ok: false,
          status: 503,
          text: async () => 'Service Unavailable',
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ meta: { images: { 'login.png': 'hash-retry' } } }),
      });
    });

    const hash = await uploadImage({
      fileKey: 'abc123',
      token: 'tok',
      filename: 'login.png',
      bytes: Buffer.from([0x89]),
    });

    expect(hash).toBe('hash-retry');
    expect(calls).toBe(3);
  }, 10_000);

  it('does NOT retry on 4xx (other than 429)', async () => {
    let calls = 0;
    (fetch as any).mockImplementation(() => {
      calls++;
      return Promise.resolve({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });
    });

    await expect(
      uploadImage({
        fileKey: 'abc123',
        token: 'bad',
        filename: 'x.png',
        bytes: Buffer.from([0]),
      }),
    ).rejects.toThrowError(/403.*Forbidden/);

    expect(calls).toBe(1);
  });
});

describe('fetchComments', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GETs the correct URL with token header', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => readFixture('figma-comments-response.json'),
    });

    await fetchComments({ fileKey: 'abc123', token: 'tok' });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe('https://api.figma.com/v1/files/abc123/comments');
    expect(init.method).toBe('GET');
    expect(init.headers['X-Figma-Token']).toBe('tok');
  });

  it('returns an array of parsed comments', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => readFixture('figma-comments-response.json'),
    });

    const comments = await fetchComments({ fileKey: 'abc123', token: 'tok' });
    expect(comments).toHaveLength(3);
    expect(comments[0]).toMatchObject({
      id: '12345',
      message: 'Make this button bigger',
      nodeId: '1:42',
      authorName: 'Sarah',
      resolved: false,
    });
    expect(comments[0].authorHandle).toBeTruthy();
    expect(comments[2].resolved).toBe(true);
  });

  it('throws on 4xx', async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    await expect(
      fetchComments({ fileKey: 'abc123', token: 'bad' }),
    ).rejects.toThrowError(/401.*Unauthorized/);
  });
});

describe('filterCommentsByFrameIds', () => {
  const sample: any[] = [
    { id: '1', nodeId: '1:42', message: 'a', authorName: 'A', authorHandle: 'A', createdAt: 't1', resolved: false },
    { id: '2', nodeId: '1:43', message: 'b', authorName: 'B', authorHandle: 'B', createdAt: 't2', resolved: false },
    { id: '3', nodeId: '9:99', message: 'c', authorName: 'C', authorHandle: 'C', createdAt: 't3', resolved: false },
    { id: '4', nodeId: null,   message: 'd', authorName: 'D', authorHandle: 'D', createdAt: 't4', resolved: false },
  ];

  it('returns only comments whose nodeId is in the allow set', () => {
    const out = filterCommentsByFrameIds(sample, new Set(['1:42', '1:43']));
    expect(out.map((c) => c.id)).toEqual(['1', '2']);
  });

  it('returns empty array when no comments match', () => {
    expect(filterCommentsByFrameIds(sample, new Set(['nope']))).toEqual([]);
  });

  it('excludes comments with null nodeId', () => {
    const out = filterCommentsByFrameIds(sample, new Set(['1:42', '1:43', '9:99']));
    expect(out.map((c) => c.id)).toEqual(['1', '2', '3']);
  });
});

describe('getMe', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the authenticated user handle on 200', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ handle: 'sarah', email: 'sarah@example.com' }),
    });
    const me = await getMe({ token: 'figd_abc' });
    expect(me.handle).toBe('sarah');
  });

  it('throws a token-specific error on 401', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Invalid token',
    });
    await expect(getMe({ token: 'figd_bad' })).rejects.toThrow(/401|token/i);
  });
});

describe('getFile', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the file metadata on 200', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ name: 'My File', lastModified: '2026-05-01T00:00:00Z' }),
    });
    const file = await getFile({ fileKey: 'abc123', token: 'figd_abc' });
    expect(file.name).toBe('My File');
  });

  it('throws a clearly distinct error on 403 (no access)', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    });
    await expect(getFile({ fileKey: 'abc', token: 'figd_x' })).rejects.toThrow(/403|access/i);
  });

  it('throws a clearly distinct error on 404 (not found)', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    });
    await expect(getFile({ fileKey: 'nope', token: 'figd_x' })).rejects.toThrow(/404|not found/i);
  });
});
