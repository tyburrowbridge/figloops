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
