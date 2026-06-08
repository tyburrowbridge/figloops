// Zod schema + reader/writer for feedback/state.json — the source of truth
// for figloops. Replaces the old src/round-state.ts (currentRound only).
//
// Shape is the v1 schema documented in
// docs/superpowers/specs/2026-05-20-figloops-v1-design.md (section "State model").
import { z } from 'zod';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const uiThemeSchema = z.enum(['light', 'dark']);
export type UiTheme = z.infer<typeof uiThemeSchema>;

export const phaseSchema = z.enum([
  'capture',
  'push',
  'await-comments',
  'pull',
  'comment-review',
  'cluster',
  'plan-approval',
  'implement',
  'close',
]);
export type Phase = z.infer<typeof phaseSchema>;

export const planStatusSchema = z.enum([
  'proposed',
  'approved',
  'rejected',
  'shipped',
  'dropped',
]);
export type PlanStatus = z.infer<typeof planStatusSchema>;

const captureSchema = z.object({
  label: z.string().min(1),
  path: z.string().regex(/^\//),
  filename: z.string().min(1),
});

const pushManifestSchema = z.object({
  pageId: z.string().min(1),
  frames: z.array(
    z.object({
      label: z.string().min(1),
      frameId: z.string().min(1),
      imageHash: z.string().min(1).optional(),
    }),
  ),
});

const commentSchema = z.object({
  id: z.string().min(1),
  frameLabel: z.string().nullable(),
  authorName: z.string(),
  authorHandle: z.string(),
  message: z.string(),
  createdAt: z.string(),
  resolved: z.boolean(),
});

const themeSchema = z.object({
  name: z.string().min(1),
  commentIds: z.array(z.string()),
  summary: z.string(),
});

const planItemSchema = z.object({
  id: z.string().min(1),
  themeName: z.string().min(1),
  change: z.string().min(1),
  drivesFrom: z.array(z.string()),
  status: planStatusSchema,
});

const roundGitSchema = z.object({
  branch: z.string().min(1),
  baseBranch: z.string().min(1),
});

const roundDataSchema = z.object({
  completedAt: z.string().optional(),
  captures: z.array(captureSchema),
  pushManifest: pushManifestSchema.nullable(),
  comments: z.array(commentSchema),
  themes: z.array(themeSchema),
  plan: z.array(planItemSchema),
  git: roundGitSchema.optional(),
});

export const stateSchema = z.object({
  schemaVersion: z.literal(1),
  currentRound: z.number().int().positive(),
  currentPhase: phaseSchema,
  uiTheme: uiThemeSchema.optional(),
  rounds: z.record(z.string().regex(/^\d+$/), roundDataSchema),
});

export type State = z.infer<typeof stateSchema>;
export type RoundData = z.infer<typeof roundDataSchema>;
export type RoundGit = z.infer<typeof roundGitSchema>;
export type Capture = z.infer<typeof captureSchema>;
export type PushManifest = z.infer<typeof pushManifestSchema>;
export type Comment = z.infer<typeof commentSchema>;
export type Theme = z.infer<typeof themeSchema>;
export type PlanItem = z.infer<typeof planItemSchema>;

function emptyRound(): RoundData {
  return { captures: [], pushManifest: null, comments: [], themes: [], plan: [] };
}

export function initState(path: string): void {
  if (existsSync(path)) {
    throw new Error(`State file already exists at ${path}; refusing to overwrite.`);
  }
  // Ensure the parent directory exists so callers don't have to mkdir first.
  mkdirSync(dirname(path), { recursive: true });
  const state: State = {
    schemaVersion: 1,
    currentRound: 1,
    currentPhase: 'capture',
    rounds: { '1': emptyRound() },
  };
  writeState(path, state);
}

export function loadState(path: string): State {
  if (!existsSync(path)) {
    throw new Error(`State file not found at ${path}. Run /figloops:init first.`);
  }
  const raw = readFileSync(path, 'utf8');
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in state at ${path}: ${(err as Error).message}`);
  }
  const result = stateSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid state at ${path}:\n${issues}`);
  }
  return result.data;
}

export function writeState(path: string, state: State): void {
  const result = stateSchema.safeParse(state);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('\n');
    throw new Error(`Refusing to write invalid state:\n${issues}`);
  }
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
}

export function ensureRound(state: State, round: number): void {
  const key = String(round);
  if (!state.rounds[key]) {
    state.rounds[key] = emptyRound();
  }
}

export function currentRoundData(state: State): RoundData {
  const data = state.rounds[String(state.currentRound)];
  if (!data) {
    throw new Error(`State has no entry for currentRound=${state.currentRound}`);
  }
  return data;
}
