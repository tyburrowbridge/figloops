const FIGMA_API_BASE = 'https://api.figma.com';

export interface FigmaComment {
  id: string;
  message: string;
  nodeId: string | null;
  authorName: string;
  authorHandle: string;
  createdAt: string;
  resolved: boolean;
  parentId: string | null;
  replies: FigmaComment[];
}

interface RawCommentsResponse {
  comments: Array<{
    id: string;
    message: string;
    client_meta?: { node_id?: string };
    user: { handle: string; id?: string };
    created_at: string;
    resolved_at: string | null;
    parent_id?: string;
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
  const all: FigmaComment[] = data.comments.map((c) => ({
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
    parentId: c.parent_id && c.parent_id.length > 0 ? c.parent_id : null,
    replies: [],
  }));
  const byId = new Map(all.map((c) => [c.id, c]));
  const roots: FigmaComment[] = [];
  for (const c of all) {
    if (c.parentId === null) {
      roots.push(c);
    } else {
      const parent = byId.get(c.parentId);
      if (parent) parent.replies.push(c);
    }
  }
  for (const r of roots) {
    r.replies.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  return roots;
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

export interface PostCommentArgs {
  fileKey: string;
  token: string;
  message: string;
  clientMeta: { node_id: string; node_offset?: { x: number; y: number } } | { x: number; y: number };
}

export async function postComment(args: PostCommentArgs): Promise<string> {
  const res = await fetch(`${FIGMA_API_BASE}/v1/files/${args.fileKey}/comments`, {
    method: 'POST',
    headers: { 'X-Figma-Token': args.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: args.message, client_meta: args.clientMeta }),
  });
  if (!res.ok) throw new Error(`Figma postComment failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { id: string };
  return data.id;
}

export interface PostReplyArgs {
  fileKey: string;
  token: string;
  parentId: string;
  message: string;
}

export async function postReply(args: PostReplyArgs): Promise<string> {
  const res = await fetch(`${FIGMA_API_BASE}/v1/files/${args.fileKey}/comments`, {
    method: 'POST',
    headers: { 'X-Figma-Token': args.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: args.message, comment_id: args.parentId }),
  });
  if (!res.ok) throw new Error(`Figma postReply failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { id: string };
  return data.id;
}

export interface DeleteCommentArgs {
  fileKey: string;
  token: string;
  commentId: string;
}

export async function deleteComment(args: DeleteCommentArgs): Promise<void> {
  const res = await fetch(`${FIGMA_API_BASE}/v1/files/${args.fileKey}/comments/${args.commentId}`, {
    method: 'DELETE',
    headers: { 'X-Figma-Token': args.token },
  });
  if (res.status === 404) return;
  if (!res.ok) throw new Error(`Figma deleteComment failed (${res.status}): ${await res.text()}`);
}
