// Zod schema + loader for figloops.config.json (consuming repo).
// Validates devServer, viewport, figma file key + changelog page name, routes.
import { z } from 'zod';
import { readFileSync } from 'node:fs';

// A scenario setup step. A bare string is shorthand for a click (backward
// compatible with earlier configs + auto-discovered scenarios). Object forms
// drive inputs so we can capture post-interaction states — e.g. type a value
// then click Search to reach a results view.
export const setupStepSchema = z.union([
  z.string().min(1), // shorthand: click this selector
  z.object({ action: z.literal('click'), selector: z.string().min(1) }),
  z.object({ action: z.literal('fill'), selector: z.string().min(1), value: z.string() }),
  z.object({ action: z.literal('press'), selector: z.string().min(1), key: z.string().min(1) }),
  z.object({ action: z.literal('select'), selector: z.string().min(1), value: z.string() }),
]);

export type SetupStep = z.infer<typeof setupStepSchema>;

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
      // Reach SSO/SAML-gated pages. Two mutually exclusive strategies; if both
      // are set, cdpEndpoint wins. Reused by capture + scenario discovery.
      //
      // cdpEndpoint: attach to a Chrome you started with --remote-debugging-port
      //   (e.g. "http://localhost:9222"). Capture reuses that browser's live,
      //   already-authenticated session — nothing to refresh.
      // storageState: path (relative to the consuming repo) to a Playwright
      //   storageState JSON file of session cookies. Generate it with
      //   auth-login.ts; re-run when the session expires.
      cdpEndpoint: z.string().url().optional(),
      storageState: z.string().min(1).optional(),
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
        setup: z.array(setupStepSchema).optional(),
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
