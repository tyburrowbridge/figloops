const FIGMA_API_BASE = 'https://api.figma.com';

export interface UploadImageArgs {
  fileKey: string;
  token: string;
  filename: string;
  bytes: Uint8Array | Buffer;
}

export async function uploadImage(args: UploadImageArgs): Promise<string> {
  const url = `${FIGMA_API_BASE}/v1/images/${args.fileKey}`;
  const headers: Record<string, string> = {
    'X-Figma-Token': args.token,
    'Content-Type': 'application/octet-stream',
  };

  const AUTH_STATUSES = new Set([401, 403, 404]);
  const MAX_ATTEMPTS = 3;
  let attempt = 0;

  while (true) {
    const res = await fetch(url, { method: 'POST', headers, body: args.bytes });

    if (res.ok) {
      const data = (await res.json()) as { meta: { images: Record<string, string> } };
      return data.meta.images[args.filename];
    }

    if (AUTH_STATUSES.has(res.status)) {
      const body = await res.text();
      throw new Error(
        `Figma rejected the upload (${res.status}) for file ${args.fileKey}. ` +
        `Check FIGMA_TOKEN has edit access. Body: ${body}`,
      );
    }

    if (res.status >= 500 || res.status === 429) {
      attempt++;
      if (attempt >= MAX_ATTEMPTS) {
        const body = await res.text();
        throw new Error(`Figma upload failed (${res.status}) after ${MAX_ATTEMPTS} attempts: ${body}`);
      }
      await new Promise((r) => setTimeout(r, 100 * attempt));
      continue;
    }

    const body = await res.text();
    throw new Error(`Figma upload failed (${res.status}): ${body}`);
  }
}

export interface FigmaComment {
  id: string;
  message: string;
  nodeId: string | null;
  authorName: string;
  authorHandle: string;
  createdAt: string;
  resolved: boolean;
}

interface RawCommentsResponse {
  comments: Array<{
    id: string;
    message: string;
    client_meta?: { node_id?: string };
    user: { handle: string; id?: string };
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
    // Figma's REST returns the display name in `user.handle`.
    // We expose both authorName (display) and authorHandle (with @ prefix when available)
    // for symmetry with the state schema; they are the same source for now.
    authorName: c.user.handle,
    authorHandle: c.user.id ? `@${c.user.id}` : c.user.handle,
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

export interface MeResponse {
  handle: string;
  email?: string;
}

export async function getMe(args: { token: string }): Promise<MeResponse> {
  const res = await fetch(`${FIGMA_API_BASE}/v1/me`, {
    headers: { 'X-Figma-Token': args.token },
  });
  if (res.status === 401) {
    throw new Error('Figma 401 — token rejected. Generate or refresh at https://www.figma.com/developers/api#access-tokens');
  }
  if (!res.ok) {
    throw new Error(`Figma /v1/me failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as MeResponse;
}

export interface FileResponse {
  name: string;
  lastModified?: string;
}

export async function getFile(args: { fileKey: string; token: string }): Promise<FileResponse> {
  const res = await fetch(`${FIGMA_API_BASE}/v1/files/${args.fileKey}`, {
    headers: { 'X-Figma-Token': args.token },
  });
  if (res.status === 403) {
    throw new Error(`Figma 403 — you do not have access to file ${args.fileKey}. Confirm the URL and that the token's user has edit permission.`);
  }
  if (res.status === 404) {
    throw new Error(`Figma 404 — file ${args.fileKey} not found. Confirm the URL you pasted.`);
  }
  if (!res.ok) {
    throw new Error(`Figma /v1/files/${args.fileKey} failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as FileResponse;
}
