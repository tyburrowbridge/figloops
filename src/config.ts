import { z } from 'zod';

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
});

export type Config = z.infer<typeof configSchema>;
