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
  auth: z
    .object({
      // Path (relative to the consuming repo) to a Playwright storageState
      // JSON file holding session cookies. Generate it with auth-login.ts.
      // Reused by capture + scenario discovery to reach SSO/SAML-gated pages.
      storageState: z.string().min(1),
    })
    .optional(),
  routes: z
    .array(
      z.object({
        label: z.string().min(1),
        path: z.string().regex(/^\//, "path must start with '/'"),
        waitFor: z.string().optional(),
      }),
    )
    .min(1, 'at least one route is required'),
  scenarios: z
    .array(
      z.object({
        label: z.string().min(1),
        path: z.string().regex(/^\//, "path must start with '/'"),
        setup: z.array(z.string().min(1)).optional(),
        waitFor: z.string().optional(),
        kind: z.enum(['modal', 'panel', 'menu', 'tab']).optional(),
      }),
    )
    .optional(),
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
