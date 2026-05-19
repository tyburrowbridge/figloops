const FIGMA_API_BASE = 'https://api.figma.com';

export interface UploadImageArgs {
  fileKey: string;
  token: string;
  filename: string;
  bytes: Buffer;
}

interface UploadResponse {
  meta?: { images?: Record<string, string> };
}

export async function uploadImage(args: UploadImageArgs): Promise<string> {
  const url = `${FIGMA_API_BASE}/v1/images/${args.fileKey}`;
  const form = new FormData();
  form.append(args.filename, new Blob([args.bytes], { type: 'image/png' }), args.filename);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'X-Figma-Token': args.token },
    body: form as any,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Figma upload failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as UploadResponse;
  const hash = data.meta?.images?.[args.filename];
  if (!hash) {
    throw new Error(
      `Figma upload response missing meta.images.${args.filename}: ${JSON.stringify(data)}`,
    );
  }
  return hash;
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
