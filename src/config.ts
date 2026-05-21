// Zod schema + loader for figloops.config.json (consuming repo).
// Validates devServer, viewport, figma file key + changelog page name, routes.
import { z } from 'zod';
import { readFileSync } from 'node:fs';

export const configSchema = z.object({
  devServer: z.object({
    url: z.string().url(),
    waitFor: z
      .enum(['networkidle', 'load', 'domcontentloaded'])
      .default('networkidle'),
  }),
  viewport: z.object({
    width: z.number().int().min(200),
    height: z.number().int().min(200),
  }),
  figma: z.object({
    fileKey: z.string().min(1),
    changelogPageName: z.string().min(1),
  }),
  routes: z
    .array(
      z.object({
        label: z.string().min(1),
        path: z.string().regex(/^\//, "path must start with '/'"),
        waitFor: z.string().optional(),
      }),
    )
    .min(1, 'at least one route is required'),
  git: z
    .object({
      branchPerRound: z.enum(['ask', 'always', 'never']).default('ask'),
    })
    .optional(),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(path: string): Config {
  const raw = readFileSync(path, 'utf8');
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in config at ${path}: ${(err as Error).message}`);
  }
  const result = configSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid config at ${path}:\n${issues}`);
  }
  return result.data;
}
