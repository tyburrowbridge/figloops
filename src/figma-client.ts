const FIGMA_API_BASE = 'https://api.figma.com';
const RETRY_DELAYS_MS = [500, 1000]; // 3 attempts total (initial + 2 retries)

export interface UploadImageArgs {
  fileKey: string;
  token: string;
  filename: string;
  bytes: Buffer;
}

interface UploadResponse {
  meta?: { images?: Record<string, string> };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(status: number): boolean {
  return status >= 500 || status === 429;
}

export async function uploadImage(args: UploadImageArgs): Promise<string> {
  const url = `${FIGMA_API_BASE}/v1/images/${args.fileKey}`;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const form = new FormData();
    form.append(args.filename, new Blob([args.bytes], { type: 'image/png' }), args.filename);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'X-Figma-Token': args.token },
      body: form as any,
    });

    if (res.ok) {
      const data = (await res.json()) as UploadResponse;
      const hash = data.meta?.images?.[args.filename];
      if (!hash) {
        throw new Error(
          `Figma upload response missing meta.images.${args.filename}: ${JSON.stringify(data)}`,
        );
      }
      return hash;
    }

    const body = await res.text();

    if (isRetryable(res.status) && attempt < RETRY_DELAYS_MS.length) {
      process.stderr.write(
        `[figma-client] upload attempt ${attempt + 1} failed (${res.status}); retrying in ${RETRY_DELAYS_MS[attempt]}ms\n`,
      );
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }

    throw new Error(`Figma upload failed (${res.status}): ${body}`);
  }

  throw new Error('unreachable'); // exhausted loop without throwing
}

export interface FigmaComment {
  id: string;
  message: string;
  nodeId: string | null;
  author: string;
  createdAt: string;
  resolved: boolean;
}

interface RawCommentsResponse {
  comments: Array<{
    id: string;
    message: string;
    client_meta?: { node_id?: string };
    user: { handle: string };
    created_at: string;
    resolved_at: string | null;
  }>;
}

export interface FetchCommentsArgs {
  fileKey: string;
  token: string;
}

export async function fetchComments(args: FetchCommentsArgs): Promise<FigmaComment[]> {
  const url = `${FIGMA_API_BASE}/v1/files/${args.fileKey}/comments`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'X-Figma-Token': args.token },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Figma fetchComments failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as RawCommentsResponse;
  return data.comments.map((c) => ({
    id: c.id,
    message: c.message,
    nodeId: c.client_meta?.node_id ?? null,
    author: c.user.handle,
    createdAt: c.created_at,
    resolved: c.resolved_at !== null,
  }));
}

export function filterCommentsByFrameIds(
  comments: FigmaComment[],
  allowed: Set<string>,
): FigmaComment[] {
  return comments.filter((c) => c.nodeId !== null && allowed.has(c.nodeId));
}
