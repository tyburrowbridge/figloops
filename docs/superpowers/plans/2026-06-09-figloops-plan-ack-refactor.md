# figloops Plan-Ack Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the terminal-bound `plan-approval` and `implement` phases with a single Figma-side `plan-ack` phase where users resolve comment threads (shipped) or reply `/skip` (won't do) directly in Figma.

**Architecture:** A new skill `figloops-next-plan-ack` runs in two modes — render+anchor (first entry) and refresh (subsequent entries). The render mode draws a plan frame in Figma via the MCP and POSTs anchor comment threads via REST. The refresh mode GETs thread states, parses `/skip` replies and `resolved_at`, applies a delta, and either stays put or auto-advances to `close`. State schema bumps from v1 → v2 with an in-place migration.

**Tech Stack:** TypeScript (strict), Zod for state validation, Vitest for tests, Figma REST API (comments POST/GET/DELETE), Figma MCP / `use_figma` for frame rendering.

---

## Plan-wide conventions

- Every script in `scripts/` is invoked via `tsx`. None require build steps.
- Tests live in `tests/`, mirror the script name with `.test.ts`. `fetch` is stubbed via `vi.stubGlobal`.
- Commit message prefix: `feat:` for new files, `refactor:` for state-shape changes, `chore:` for skill/doc edits, `test:` for test-only commits.
- Run `npx vitest run` (no watch) after each task.
- Run `npx tsc --noEmit` before commit on any task that touches `src/state.ts` or scripts.

---

## File structure

### Created
- `src/migrations/v1-to-v2.ts` — pure transform `(stateV1) → stateV2`
- `tests/migrations/v1-to-v2.test.ts`
- `scripts/render-plan-frame.ts` — emits the `use_figma` payload for the plan frame
- `tests/render-plan-frame.test.ts`
- `scripts/anchor-plan-threads.ts` — POSTs comments + bot replies via REST
- `tests/anchor-plan-threads.test.ts`
- `scripts/pull-plan-states.ts` — GETs threads, parses `/skip` + resolve
- `tests/pull-plan-states.test.ts`
- `scripts/cleanup-bot-replies.ts` — DELETEs bot reply IDs
- `tests/cleanup-bot-replies.test.ts`
- `skills/figloops-next-plan-ack/SKILL.md` — new skill
- `tests/fixtures/comments-with-replies.json` — REST response fixture

### Modified
- `src/state.ts` — schema v2, migration glue
- `src/figma-client.ts` — add `postComment`, `postReply`, `deleteComment`, extend `fetchComments` to include reply chains
- `scripts/update-plan.ts` — accept new status enum
- `scripts/format-changelog.ts` — wontdo instead of dropped
- `scripts/render-snapshot.ts` — new statuses + Figma link column
- `scripts/advance-phase.ts` — accept new phase names
- `skills/figloops/SKILL.md` — route table
- `skills/figloops-next-cluster/SKILL.md` — handoff to plan-ack
- `skills/figloops-next-close/SKILL.md` — cleanup + 8 tasks
- `skills/figloops-init/SKILL.md` — 8 initial tasks
- `README.md` — phase + gate tables
- `CHANGELOG.md` — entry

### Deleted
- `skills/figloops-next-plan/SKILL.md`
- `skills/figloops-next-implement/SKILL.md`

---

## Dependency map (for parallel execution)

```
Foundation (must be serial, blocks everything):
  Task 1: State schema v2 + migration
  Task 2: figma-client REST helpers

Phase A (parallel after Foundation):
  Task 3: render-plan-frame.ts
  Task 4: anchor-plan-threads.ts
  Task 5: pull-plan-states.ts
  Task 6: cleanup-bot-replies.ts

Phase B (parallel after Phase A):
  Task 7: update-plan.ts changes
  Task 8: format-changelog.ts changes
  Task 9: render-snapshot.ts changes
  Task 10: advance-phase.ts changes

Phase C (parallel after Phase B):
  Task 11: figloops-next-plan-ack skill
  Task 12: figloops-next-cluster skill update
  Task 13: figloops-next-close skill update
  Task 14: figloops-init skill update
  Task 15: figloops dispatch skill route table
  Task 16: delete plan + implement skills

Phase D (parallel, can run any time after Phase A):
  Task 17: README.md update
  Task 18: CHANGELOG.md entry
  Task 19: v1 spec note pointing to refactor spec

Phase E (serial, last):
  Task 20: end-to-end manual smoke test checklist
```

Tasks within a phase touch disjoint files and are safe to parallelize.

---

## Task 1: State schema v2 + migration

**Files:**
- Modify: `src/state.ts`
- Create: `src/migrations/v1-to-v2.ts`
- Create: `tests/migrations/v1-to-v2.test.ts`
- Modify: `tests/state.test.ts`

### Step 1.1: Write failing migration test

- [ ] Create `tests/migrations/v1-to-v2.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { migrateV1ToV2 } from '../../src/migrations/v1-to-v2.js';

describe('migrateV1ToV2', () => {
  it('bumps schemaVersion 1 → 2', () => {
    const v1 = {
      schemaVersion: 1,
      currentRound: 1,
      currentPhase: 'capture',
      rounds: { '1': { captures: [], pushManifest: null, comments: [], themes: [], plan: [] } },
    };
    const v2 = migrateV1ToV2(v1);
    expect(v2.schemaVersion).toBe(2);
  });

  it('remaps phase plan-approval → plan-ack', () => {
    const v1 = {
      schemaVersion: 1,
      currentRound: 1,
      currentPhase: 'plan-approval',
      rounds: { '1': { captures: [], pushManifest: null, comments: [], themes: [], plan: [] } },
    };
    expect(migrateV1ToV2(v1).currentPhase).toBe('plan-ack');
  });

  it('remaps phase implement → plan-ack', () => {
    const v1 = {
      schemaVersion: 1,
      currentRound: 1,
      currentPhase: 'implement',
      rounds: { '1': { captures: [], pushManifest: null, comments: [], themes: [], plan: [] } },
    };
    expect(migrateV1ToV2(v1).currentPhase).toBe('plan-ack');
  });

  it.each([
    ['proposed', 'pending'],
    ['approved', 'pending'],
    ['rejected', 'wontdo'],
    ['dropped', 'wontdo'],
    ['shipped', 'shipped'],
  ])('remaps plan status %s → %s', (oldStatus, newStatus) => {
    const v1 = {
      schemaVersion: 1,
      currentRound: 1,
      currentPhase: 'capture',
      rounds: {
        '1': {
          captures: [],
          pushManifest: null,
          comments: [],
          themes: [],
          plan: [
            {
              id: 'p1',
              themeName: 'T',
              change: 'C',
              drivesFrom: [],
              status: oldStatus,
            },
          ],
        },
      },
    };
    const v2 = migrateV1ToV2(v1);
    expect(v2.rounds['1'].plan[0].status).toBe(newStatus);
  });

  it('passes through unaffected phases', () => {
    const v1 = {
      schemaVersion: 1,
      currentRound: 2,
      currentPhase: 'cluster',
      rounds: { '2': { captures: [], pushManifest: null, comments: [], themes: [], plan: [] } },
    };
    expect(migrateV1ToV2(v1).currentPhase).toBe('cluster');
  });

  it('preserves non-plan fields', () => {
    const v1 = {
      schemaVersion: 1,
      currentRound: 1,
      currentPhase: 'capture',
      uiTheme: 'dark' as const,
      rounds: {
        '1': {
          captures: [{ label: 'L', path: '/p', filename: 'f.png' }],
          pushManifest: null,
          comments: [],
          themes: [],
          plan: [],
        },
      },
    };
    const v2 = migrateV1ToV2(v1);
    expect(v2.uiTheme).toBe('dark');
    expect(v2.rounds['1'].captures).toEqual([{ label: 'L', path: '/p', filename: 'f.png' }]);
  });
});
```

### Step 1.2: Run test to verify it fails

- [ ] Run: `npx vitest run tests/migrations/v1-to-v2.test.ts`
  Expected: FAIL with "Cannot find module '../../src/migrations/v1-to-v2.js'"

### Step 1.3: Implement migration

- [ ] Create `src/migrations/v1-to-v2.ts`:

```ts
// One-shot transformer from state schema v1 → v2.
// Pure function: returns a new object, does not mutate input.

const PHASE_MAP: Record<string, string> = {
  'plan-approval': 'plan-ack',
  'implement': 'plan-ack',
};

const STATUS_MAP: Record<string, string> = {
  proposed: 'pending',
  approved: 'pending',
  rejected: 'wontdo',
  dropped: 'wontdo',
  shipped: 'shipped',
};

export function migrateV1ToV2(v1: any): any {
  const remappedPhase = PHASE_MAP[v1.currentPhase] ?? v1.currentPhase;
  const remappedRounds: Record<string, any> = {};
  for (const [k, round] of Object.entries(v1.rounds as Record<string, any>)) {
    remappedRounds[k] = {
      ...round,
      plan: (round.plan ?? []).map((item: any) => ({
        ...item,
        status: STATUS_MAP[item.status] ?? item.status,
      })),
    };
  }
  return {
    ...v1,
    schemaVersion: 2,
    currentPhase: remappedPhase,
    rounds: remappedRounds,
  };
}
```

### Step 1.4: Run test to verify pass

- [ ] Run: `npx vitest run tests/migrations/v1-to-v2.test.ts`
  Expected: PASS (all 7 cases)

### Step 1.5: Update `src/state.ts` schema

- [ ] In `src/state.ts`, change `phaseSchema`:

```ts
export const phaseSchema = z.enum([
  'capture',
  'push',
  'await-comments',
  'pull',
  'comment-review',
  'cluster',
  'plan-ack',
  'close',
]);
```

- [ ] In `src/state.ts`, change `planStatusSchema`:

```ts
export const planStatusSchema = z.enum([
  'pending',
  'shipped',
  'wontdo',
  'removed',
]);
```

- [ ] In `src/state.ts`, extend `planItemSchema`:

```ts
const planItemSchema = z.object({
  id: z.string().min(1),
  themeName: z.string().min(1),
  change: z.string().min(1),
  drivesFrom: z.array(z.string()),
  status: planStatusSchema,
  commentId: z.string().min(1).optional(),
  botReplyId: z.string().min(1).optional(),
  rowIndex: z.number().int().nonnegative().optional(),
});
```

- [ ] In `src/state.ts`, add `planFrameSchema` and attach to `roundDataSchema`:

```ts
const planFrameSchema = z.object({
  pageId: z.string().min(1),
  frameId: z.string().min(1),
  frameName: z.string().min(1),
});

const roundDataSchema = z.object({
  completedAt: z.string().optional(),
  captures: z.array(captureSchema),
  pushManifest: pushManifestSchema.nullable(),
  comments: z.array(commentSchema),
  themes: z.array(themeSchema),
  plan: z.array(planItemSchema),
  git: roundGitSchema.optional(),
  planFrame: planFrameSchema.optional(),
});
```

- [ ] In `src/state.ts`, bump `stateSchema.schemaVersion` literal:

```ts
export const stateSchema = z.object({
  schemaVersion: z.literal(2),
  // ... rest unchanged
});
```

### Step 1.6: Wire migration into `loadState`

- [ ] In `src/state.ts`, at the top of file (after existing imports), add:

```ts
import { migrateV1ToV2 } from './migrations/v1-to-v2.js';
```

- [ ] In `src/state.ts`, modify `loadState`. Replace the body so that pre-validation it checks for v1 and migrates:

```ts
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
  // Migrate v1 → v2 on the fly. Write the result back so subsequent reads are fast-path.
  if ((data as any)?.schemaVersion === 1) {
    data = migrateV1ToV2(data);
    writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
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
```

- [ ] In `src/state.ts`, change `initState` to write `schemaVersion: 2`:

```ts
export function initState(path: string): void {
  if (existsSync(path)) {
    throw new Error(`State file already exists at ${path}; refusing to overwrite.`);
  }
  mkdirSync(dirname(path), { recursive: true });
  const state: State = {
    schemaVersion: 2,
    currentRound: 1,
    currentPhase: 'capture',
    rounds: { '1': emptyRound() },
  };
  writeState(path, state);
}
```

### Step 1.7: Update existing state tests

- [ ] Open `tests/state.test.ts`. Any test that hard-codes `schemaVersion: 1`: change to `2`. Any test that hard-codes the old phase enum values (`plan-approval`, `implement`) or old status values (`proposed`, `approved`, `rejected`, `dropped`): change to new values.

### Step 1.8: Add a migration round-trip test in state.test.ts

- [ ] Append to `tests/state.test.ts`:

```ts
describe('loadState v1 → v2 auto-migration', () => {
  it('migrates and persists a v1 file on first read', () => {
    const tmp = `/tmp/figloops-state-${Date.now()}.json`;
    writeFileSync(tmp, JSON.stringify({
      schemaVersion: 1,
      currentRound: 1,
      currentPhase: 'plan-approval',
      rounds: {
        '1': {
          captures: [],
          pushManifest: null,
          comments: [],
          themes: [],
          plan: [{ id: 'p1', themeName: 'T', change: 'C', drivesFrom: [], status: 'approved' }],
        },
      },
    }));
    const state = loadState(tmp);
    expect(state.schemaVersion).toBe(2);
    expect(state.currentPhase).toBe('plan-ack');
    expect(state.rounds['1'].plan[0].status).toBe('pending');
    const persisted = JSON.parse(readFileSync(tmp, 'utf8'));
    expect(persisted.schemaVersion).toBe(2);
    unlinkSync(tmp);
  });
});
```

Add the corresponding imports at top of `tests/state.test.ts` if not present: `import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';`

### Step 1.9: Run all state-related tests

- [ ] Run: `npx vitest run tests/state.test.ts tests/migrations/v1-to-v2.test.ts`
  Expected: all PASS

### Step 1.10: Typecheck

- [ ] Run: `npx tsc --noEmit`
  Expected: no errors

### Step 1.11: Commit

- [ ] ```bash
git add src/state.ts src/migrations/v1-to-v2.ts tests/migrations/v1-to-v2.test.ts tests/state.test.ts
git commit -m "refactor(state): bump schema to v2 with plan-ack phase and slash-skip status enum"
```

---

## Task 2: figma-client REST helpers

**Files:**
- Modify: `src/figma-client.ts`
- Modify: `tests/figma-client.test.ts`
- Create: `tests/fixtures/comments-with-replies.json`

### Step 2.1: Create fixture

- [ ] Create `tests/fixtures/comments-with-replies.json`:

```json
{
  "comments": [
    {
      "id": "c1",
      "message": "Item #1: Add breadcrumbs to Dashboard",
      "client_meta": { "node_id": "0:1" },
      "user": { "handle": "bot", "id": "bot-id" },
      "created_at": "2026-06-09T10:00:00Z",
      "resolved_at": null,
      "parent_id": ""
    },
    {
      "id": "c1-r1",
      "message": "🤖 Resolve thread (✓) = shipped · Reply `/skip` = won't do",
      "user": { "handle": "bot", "id": "bot-id" },
      "created_at": "2026-06-09T10:00:01Z",
      "resolved_at": null,
      "parent_id": "c1"
    },
    {
      "id": "c1-r2",
      "message": "/skip",
      "user": { "handle": "designer", "id": "des-id" },
      "created_at": "2026-06-09T11:00:00Z",
      "resolved_at": null,
      "parent_id": "c1"
    },
    {
      "id": "c2",
      "message": "Item #2: Increase contrast",
      "client_meta": { "client_meta": { "x": 0, "y": 200 } },
      "user": { "handle": "bot", "id": "bot-id" },
      "created_at": "2026-06-09T10:00:00Z",
      "resolved_at": "2026-06-09T12:00:00Z",
      "parent_id": ""
    }
  ]
}
```

### Step 2.2: Write failing tests for new fetchComments behavior

- [ ] Append to `tests/figma-client.test.ts`:

```ts
describe('fetchComments — replies + parent_id', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('exposes parent_id and orders replies under each thread', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => readFixture('comments-with-replies.json'),
    });
    const comments = await fetchComments({ fileKey: 'k', token: 't' });
    const c1 = comments.find(c => c.id === 'c1')!;
    expect(c1.parentId).toBe(null);
    expect(c1.replies.map(r => r.id)).toEqual(['c1-r1', 'c1-r2']);
    expect(c1.replies[1].message).toBe('/skip');
  });

  it('marks resolved threads via resolved_at', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => readFixture('comments-with-replies.json'),
    });
    const comments = await fetchComments({ fileKey: 'k', token: 't' });
    const c2 = comments.find(c => c.id === 'c2')!;
    expect(c2.resolved).toBe(true);
  });
});

describe('postComment', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('POSTs to /v1/files/:key/comments with message and client_meta', async () => {
    (fetch as any).mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ id: 'new-id' }),
    });
    const id = await postComment({
      fileKey: 'k', token: 't',
      message: 'hi', clientMeta: { node_id: '0:1', node_offset: { x: 10, y: 20 } },
    });
    expect(id).toBe('new-id');
    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe('https://api.figma.com/v1/files/k/comments');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      message: 'hi',
      client_meta: { node_id: '0:1', node_offset: { x: 10, y: 20 } },
    });
  });
});

describe('postReply', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('POSTs with comment_id pointing to parent', async () => {
    (fetch as any).mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ id: 'reply-id' }),
    });
    const id = await postReply({
      fileKey: 'k', token: 't', parentId: 'c1', message: '🤖 hello',
    });
    expect(id).toBe('reply-id');
    const [, init] = (fetch as any).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ message: '🤖 hello', comment_id: 'c1' });
  });
});

describe('deleteComment', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('DELETEs /v1/files/:key/comments/:id', async () => {
    (fetch as any).mockResolvedValue({ ok: true, status: 200 });
    await deleteComment({ fileKey: 'k', token: 't', commentId: 'c1' });
    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe('https://api.figma.com/v1/files/k/comments/c1');
    expect(init.method).toBe('DELETE');
  });

  it('tolerates 404 (already deleted)', async () => {
    (fetch as any).mockResolvedValue({ ok: false, status: 404, text: async () => 'not found' });
    await expect(deleteComment({ fileKey: 'k', token: 't', commentId: 'gone' })).resolves.toBeUndefined();
  });

  it('throws on other non-OK statuses', async () => {
    (fetch as any).mockResolvedValue({ ok: false, status: 500, text: async () => 'server err' });
    await expect(deleteComment({ fileKey: 'k', token: 't', commentId: 'c1' })).rejects.toThrow(/500/);
  });
});
```

Update the import line at the top of `tests/figma-client.test.ts` to include the new names:

```ts
import { fetchComments, filterCommentsByFrameIds, getMe, getFile, postComment, postReply, deleteComment } from '../src/figma-client.js';
```

### Step 2.3: Run tests to verify they fail

- [ ] Run: `npx vitest run tests/figma-client.test.ts`
  Expected: FAILs in new describe blocks (`postComment is not defined`, etc.) and the fetchComments replies test (no `parentId`/`replies` on returned shape).

### Step 2.4: Extend `FigmaComment` type and `fetchComments`

- [ ] In `src/figma-client.ts`, replace `FigmaComment` interface:

```ts
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
```

- [ ] In `src/figma-client.ts`, replace `RawCommentsResponse`:

```ts
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
```

- [ ] In `src/figma-client.ts`, replace `fetchComments`:

```ts
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
```

### Step 2.5: Add `postComment`, `postReply`, `deleteComment`

- [ ] Append to `src/figma-client.ts`:

```ts
export interface PostCommentArgs {
  fileKey: string;
  token: string;
  message: string;
  clientMeta: { node_id: string; node_offset?: { x: number; y: number } } | { x: number; y: number };
}

export async function postComment(args: PostCommentArgs): Promise<string> {
  const res = await fetch(`${FIGMA_API_BASE}/v1/files/${args.fileKey}/comments`, {
    method: 'POST',
    headers: {
      'X-Figma-Token': args.token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: args.message, client_meta: args.clientMeta }),
  });
  if (!res.ok) {
    throw new Error(`Figma postComment failed (${res.status}): ${await res.text()}`);
  }
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
    headers: {
      'X-Figma-Token': args.token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: args.message, comment_id: args.parentId }),
  });
  if (!res.ok) {
    throw new Error(`Figma postReply failed (${res.status}): ${await res.text()}`);
  }
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
  if (res.status === 404) return; // already gone — tolerate
  if (!res.ok) {
    throw new Error(`Figma deleteComment failed (${res.status}): ${await res.text()}`);
  }
}
```

### Step 2.6: Update existing tests that use `FigmaComment` shape

- [ ] Search `tests/` and `scripts/` for usages of `FigmaComment` fields. Any test that constructs a `FigmaComment` literal must now include `parentId: null` and `replies: []`. Add them.

Run: `npx tsc --noEmit` to find every site. Fix each compile error by adding the missing fields.

### Step 2.7: Run all figma-client tests

- [ ] Run: `npx vitest run tests/figma-client.test.ts`
  Expected: all PASS

### Step 2.8: Typecheck

- [ ] Run: `npx tsc --noEmit`
  Expected: no errors

### Step 2.9: Commit

- [ ] ```bash
git add src/figma-client.ts tests/figma-client.test.ts tests/fixtures/comments-with-replies.json
git commit -m "feat(figma-client): postComment, postReply, deleteComment, and reply-threading in fetchComments"
```

---

## Task 3: `scripts/render-plan-frame.ts`

**Files:**
- Create: `scripts/render-plan-frame.ts`
- Create: `tests/render-plan-frame.test.ts`

This script does NOT call the Figma MCP directly (the MCP runs only inside Claude). Instead, it loads the current round's plan from state and emits a JS payload string for the skill to feed into `use_figma`. The script also writes back the row coordinates after the skill returns them.

### Step 3.1: Write failing test

- [ ] Create `tests/render-plan-frame.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildPlanFramePayload, applyPlanFrameResult } from '../scripts/render-plan-frame.js';
import type { State } from '../src/state.js';

function makeState(planItems: Array<{ id: string; change: string; themeName: string }>): State {
  return {
    schemaVersion: 2,
    currentRound: 1,
    currentPhase: 'plan-ack',
    rounds: {
      '1': {
        captures: [],
        pushManifest: null,
        comments: [],
        themes: [],
        plan: planItems.map((p) => ({
          ...p,
          drivesFrom: [],
          status: 'pending' as const,
        })),
      },
    },
  };
}

describe('buildPlanFramePayload', () => {
  it('emits one row per plan item with sequential y-coords', () => {
    const state = makeState([
      { id: 'p1', change: 'Add breadcrumbs', themeName: 'Nav' },
      { id: 'p2', change: 'Bigger CTA', themeName: 'Hero' },
    ]);
    const payload = buildPlanFramePayload(state, { round: 1, pageName: 'Plan — Round 1' });
    expect(payload).toContain('Plan — Round 1');
    expect(payload).toContain('Add breadcrumbs');
    expect(payload).toContain('Bigger CTA');
    expect(payload).toContain('"id":"p1"');
    expect(payload).toContain('"id":"p2"');
  });

  it('escapes backticks and dollar signs in change text', () => {
    const state = makeState([{ id: 'p1', change: 'Fix `code` and ${var}', themeName: 'T' }]);
    const payload = buildPlanFramePayload(state, { round: 1, pageName: 'P' });
    expect(payload).not.toMatch(/`code`/);
    expect(payload).toContain('\\`code\\`');
    expect(payload).toContain('\\${var}');
  });
});

describe('applyPlanFrameResult', () => {
  it('writes planFrame and per-item rowIndex back to state', () => {
    const state = makeState([
      { id: 'p1', change: 'A', themeName: 'T' },
      { id: 'p2', change: 'B', themeName: 'T' },
    ]);
    const result = {
      pageId: 'page-1',
      frameId: 'frame-1',
      frameName: 'Plan — Round 1',
      rows: [
        { itemId: 'p1', index: 0 },
        { itemId: 'p2', index: 1 },
      ],
    };
    const next = applyPlanFrameResult(state, 1, result);
    expect(next.rounds['1'].planFrame).toEqual({
      pageId: 'page-1', frameId: 'frame-1', frameName: 'Plan — Round 1',
    });
    expect(next.rounds['1'].plan[0].rowIndex).toBe(0);
    expect(next.rounds['1'].plan[1].rowIndex).toBe(1);
  });
});
```

### Step 3.2: Run test, expect fail

- [ ] Run: `npx vitest run tests/render-plan-frame.test.ts`
  Expected: FAIL with "Cannot find module"

### Step 3.3: Implement script

- [ ] Create `scripts/render-plan-frame.ts`:

```ts
// Builds the use_figma payload for the plan frame and applies the MCP result back to state.
// The skill is responsible for actually invoking the MCP — this module is pure transform.
import { loadState, writeState, type State } from '../src/state.js';

export interface BuildOpts {
  round: number;
  pageName: string;
}

export interface FrameResult {
  pageId: string;
  frameId: string;
  frameName: string;
  rows: Array<{ itemId: string; index: number }>;
}

function escapeForTemplate(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

export function buildPlanFramePayload(state: State, opts: BuildOpts): string {
  const round = state.rounds[String(opts.round)];
  if (!round) throw new Error(`No round data for round ${opts.round}`);
  const rows = round.plan.map((item, index) => ({
    id: item.id,
    index,
    text: escapeForTemplate(item.change),
    theme: escapeForTemplate(item.themeName),
  }));
  const rowsJson = JSON.stringify(rows);
  return `
const pageName = \`${escapeForTemplate(opts.pageName)}\`;
const rows = ${rowsJson};
let page = figma.root.children.find(p => p.name === pageName);
if (!page) { page = figma.createPage(); page.name = pageName; }
await figma.setCurrentPageAsync(page);
await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });

const frame = figma.createFrame();
frame.name = \`Plan — Round ${opts.round}\`;
frame.layoutMode = 'VERTICAL';
frame.itemSpacing = 8;
frame.paddingTop = 24; frame.paddingBottom = 24; frame.paddingLeft = 24; frame.paddingRight = 24;
frame.resize(720, 100);
frame.primaryAxisSizingMode = 'AUTO';
frame.counterAxisSizingMode = 'FIXED';

const title = figma.createText();
title.fontName = { family: 'Inter', style: 'Semi Bold' };
title.fontSize = 18;
title.characters = \`Plan — Round ${opts.round}\`;
frame.appendChild(title);

const rowResults = [];
for (const r of rows) {
  const rowFrame = figma.createFrame();
  rowFrame.layoutMode = 'HORIZONTAL';
  rowFrame.itemSpacing = 12;
  rowFrame.paddingTop = 8; rowFrame.paddingBottom = 8; rowFrame.paddingLeft = 12; rowFrame.paddingRight = 12;
  rowFrame.primaryAxisSizingMode = 'FIXED';
  rowFrame.counterAxisSizingMode = 'AUTO';
  rowFrame.resize(672, 40);
  rowFrame.name = \`Item \${r.index + 1}\`;
  const num = figma.createText();
  num.fontName = { family: 'Inter', style: 'Semi Bold' };
  num.fontSize = 14;
  num.characters = \`\${r.index + 1}.\`;
  rowFrame.appendChild(num);
  const text = figma.createText();
  text.fontName = { family: 'Inter', style: 'Regular' };
  text.fontSize = 14;
  text.characters = r.text;
  rowFrame.appendChild(text);
  frame.appendChild(rowFrame);
  rowResults.push({ itemId: r.id, index: r.index, nodeId: rowFrame.id });
}

page.appendChild(frame);

return JSON.stringify({ pageId: page.id, frameId: frame.id, frameName: frame.name, rows: rowResults });
`.trim();
}

export function applyPlanFrameResult(state: State, round: number, result: FrameResult): State {
  const next: State = JSON.parse(JSON.stringify(state));
  const r = next.rounds[String(round)];
  if (!r) throw new Error(`No round data for round ${round}`);
  r.planFrame = { pageId: result.pageId, frameId: result.frameId, frameName: result.frameName };
  const indexById = new Map(result.rows.map((row) => [row.itemId, row.index]));
  for (const item of r.plan) {
    const idx = indexById.get(item.id);
    if (idx !== undefined) item.rowIndex = idx;
  }
  return next;
}

// CLI entry: read state, print payload to stdout.
// Usage: render-plan-frame.ts <statePath> <round>
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , statePath, roundArg] = process.argv;
  if (!statePath || !roundArg) {
    console.error('Usage: render-plan-frame.ts <statePath> <round>');
    process.exit(1);
  }
  const state = loadState(statePath);
  const round = parseInt(roundArg, 10);
  const pageName = `Plan — Round ${round}`;
  process.stdout.write(buildPlanFramePayload(state, { round, pageName }));
}
```

### Step 3.4: Run test, expect pass

- [ ] Run: `npx vitest run tests/render-plan-frame.test.ts`
  Expected: PASS

### Step 3.5: Typecheck + commit

- [ ] Run: `npx tsc --noEmit`
- [ ] ```bash
git add scripts/render-plan-frame.ts tests/render-plan-frame.test.ts
git commit -m "feat(scripts): render-plan-frame builder + result applier"
```

---

## Task 4: `scripts/anchor-plan-threads.ts`

**Files:**
- Create: `scripts/anchor-plan-threads.ts`
- Create: `tests/anchor-plan-threads.test.ts`

### Step 4.1: Write failing test

- [ ] Create `tests/anchor-plan-threads.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { anchorPlanThreads, BOT_REMINDER } from '../scripts/anchor-plan-threads.js';
import type { State } from '../src/state.js';

function makeState(): State {
  return {
    schemaVersion: 2,
    currentRound: 1,
    currentPhase: 'plan-ack',
    rounds: {
      '1': {
        captures: [], pushManifest: null, comments: [], themes: [],
        plan: [
          { id: 'p1', themeName: 'T', change: 'A', drivesFrom: [], status: 'pending', rowIndex: 0 },
          { id: 'p2', themeName: 'T', change: 'B', drivesFrom: [], status: 'pending', rowIndex: 1 },
        ],
        planFrame: { pageId: 'pg', frameId: 'fr', frameName: 'Plan — Round 1' },
      },
    },
  };
}

describe('anchorPlanThreads', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('POSTs one anchor + one bot reply per plan item and returns updated state', async () => {
    // 4 POSTs expected: 2 anchors, 2 replies (in order item1-anchor, item1-reply, item2-anchor, item2-reply)
    const ids = ['anchor-1', 'reply-1', 'anchor-2', 'reply-2'];
    let i = 0;
    (fetch as any).mockImplementation(async () => ({
      ok: true, status: 200, json: async () => ({ id: ids[i++] }),
    }));
    const next = await anchorPlanThreads({ state: makeState(), round: 1, fileKey: 'k', token: 't' });
    expect((fetch as any).mock.calls.length).toBe(4);
    expect(next.rounds['1'].plan[0].commentId).toBe('anchor-1');
    expect(next.rounds['1'].plan[0].botReplyId).toBe('reply-1');
    expect(next.rounds['1'].plan[1].commentId).toBe('anchor-2');
    expect(next.rounds['1'].plan[1].botReplyId).toBe('reply-2');
  });

  it('bot reminder text contains /skip token and resolve hint', () => {
    expect(BOT_REMINDER).toContain('/skip');
    expect(BOT_REMINDER).toContain('✓');
  });

  it('throws if planFrame is missing', async () => {
    const s = makeState();
    delete s.rounds['1'].planFrame;
    await expect(
      anchorPlanThreads({ state: s, round: 1, fileKey: 'k', token: 't' })
    ).rejects.toThrow(/planFrame/);
  });
});
```

### Step 4.2: Run, expect fail

- [ ] Run: `npx vitest run tests/anchor-plan-threads.test.ts`
  Expected: FAIL "Cannot find module"

### Step 4.3: Implement

- [ ] Create `scripts/anchor-plan-threads.ts`:

```ts
// Anchors a comment thread on the Figma plan frame for every plan item,
// then posts a bot reminder reply in each thread. Returns updated state.
import { loadState, writeState, type State } from '../src/state.js';
import { postComment, postReply } from '../src/figma-client.js';

export const BOT_REMINDER =
  '🤖 Resolve thread (✓) = shipped · Reply `/skip` = won\'t do · Other replies = discussion';

export interface AnchorArgs {
  state: State;
  round: number;
  fileKey: string;
  token: string;
}

export async function anchorPlanThreads(args: AnchorArgs): Promise<State> {
  const round = args.state.rounds[String(args.round)];
  if (!round) throw new Error(`No round data for round ${args.round}`);
  if (!round.planFrame) throw new Error('planFrame missing — render the plan frame first');

  const next: State = JSON.parse(JSON.stringify(args.state));
  const planNext = next.rounds[String(args.round)].plan;

  for (const item of planNext) {
    if (item.commentId) continue; // idempotent: skip already-anchored items
    const anchor = await postComment({
      fileKey: args.fileKey,
      token: args.token,
      message: `Item #${(item.rowIndex ?? 0) + 1}: ${item.change}`,
      clientMeta: { node_id: round.planFrame!.frameId, node_offset: { x: 0, y: 0 } },
    });
    const reply = await postReply({
      fileKey: args.fileKey,
      token: args.token,
      parentId: anchor,
      message: BOT_REMINDER,
    });
    item.commentId = anchor;
    item.botReplyId = reply;
  }
  return next;
}

// CLI entry: load state, run, write back.
// Usage: anchor-plan-threads.ts <statePath> <round> <fileKey> <token>
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , statePath, roundArg, fileKey, token] = process.argv;
  if (!statePath || !roundArg || !fileKey || !token) {
    console.error('Usage: anchor-plan-threads.ts <statePath> <round> <fileKey> <token>');
    process.exit(1);
  }
  const state = loadState(statePath);
  anchorPlanThreads({ state, round: parseInt(roundArg, 10), fileKey, token })
    .then((next) => writeState(statePath, next))
    .catch((err) => { console.error(err.message); process.exit(1); });
}
```

### Step 4.4: Run + commit

- [ ] Run: `npx vitest run tests/anchor-plan-threads.test.ts`
  Expected: PASS
- [ ] Run: `npx tsc --noEmit`
- [ ] ```bash
git add scripts/anchor-plan-threads.ts tests/anchor-plan-threads.test.ts
git commit -m "feat(scripts): anchor-plan-threads — POST anchor + bot reminder per item"
```

---

## Task 5: `scripts/pull-plan-states.ts`

**Files:**
- Create: `scripts/pull-plan-states.ts`
- Create: `tests/pull-plan-states.test.ts`

### Step 5.1: Failing test

- [ ] Create `tests/pull-plan-states.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pullPlanStates, parseItemStatus } from '../scripts/pull-plan-states.js';
import type { FigmaComment } from '../src/figma-client.js';

function thread(id: string, resolved: boolean, replies: Array<{ msg: string; at: string }>): FigmaComment {
  return {
    id, message: 'anchor', nodeId: null, authorName: 'bot', authorHandle: 'bot',
    createdAt: '2026-06-09T10:00:00Z', resolved, parentId: null,
    replies: replies.map((r, i) => ({
      id: `${id}-r${i}`, message: r.msg, nodeId: null, authorName: 'u', authorHandle: 'u',
      createdAt: r.at, resolved: false, parentId: id, replies: [],
    })),
  };
}

describe('parseItemStatus', () => {
  it('returns shipped when thread is resolved and no /skip reply', () => {
    expect(parseItemStatus(thread('c1', true, []))).toBe('shipped');
  });

  it('returns wontdo when latest /skip reply exists, even if resolved', () => {
    const t = thread('c1', true, [
      { msg: 'discussion', at: '2026-06-09T10:00:00Z' },
      { msg: '/skip', at: '2026-06-09T11:00:00Z' },
    ]);
    expect(parseItemStatus(t)).toBe('wontdo');
  });

  it('returns pending when open and no /skip reply', () => {
    expect(parseItemStatus(thread('c1', false, [{ msg: 'hi', at: '2026-06-09T10:00:00Z' }]))).toBe('pending');
  });

  it('matches /skip case-insensitively', () => {
    expect(parseItemStatus(thread('c1', false, [{ msg: '/SKIP', at: 'x' }]))).toBe('wontdo');
    expect(parseItemStatus(thread('c1', false, [{ msg: '/Skip extra', at: 'x' }]))).toBe('wontdo');
  });

  it('ignores /skip embedded in longer text not at start', () => {
    expect(parseItemStatus(thread('c1', false, [{ msg: 'please /skip this', at: 'x' }]))).toBe('pending');
  });

  it('walks replies newest first, returning latest action', () => {
    const t = thread('c1', false, [
      { msg: '/skip', at: '2026-06-09T10:00:00Z' },
      { msg: 'oops nevermind', at: '2026-06-09T11:00:00Z' },
    ]);
    // latest reply is "oops nevermind" — no action — but parser walks looking for ANY /skip
    // Decision: latest /skip wins. So this is wontdo.
    expect(parseItemStatus(t)).toBe('wontdo');
  });
});

describe('pullPlanStates', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns delta keyed by item id', async () => {
    (fetch as any).mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        comments: [
          { id: 'c1', message: 'anchor', user: { handle: 'b', id: 'bid' }, created_at: '2026-06-09T10:00:00Z', resolved_at: '2026-06-09T12:00:00Z' },
          { id: 'c2', message: 'anchor', user: { handle: 'b', id: 'bid' }, created_at: '2026-06-09T10:00:00Z', resolved_at: null },
          { id: 'c2-r', message: '/skip', user: { handle: 'u', id: 'uid' }, created_at: '2026-06-09T11:00:00Z', resolved_at: null, parent_id: 'c2' },
          { id: 'c3', message: 'anchor', user: { handle: 'b', id: 'bid' }, created_at: '2026-06-09T10:00:00Z', resolved_at: null },
        ],
      }),
    });
    const result = await pullPlanStates({
      fileKey: 'k', token: 't',
      items: [
        { id: 'p1', commentId: 'c1', currentStatus: 'pending' },
        { id: 'p2', commentId: 'c2', currentStatus: 'pending' },
        { id: 'p3', commentId: 'c3', currentStatus: 'pending' },
        { id: 'p4', commentId: 'missing', currentStatus: 'pending' },
      ],
    });
    expect(result.statuses).toEqual({ p1: 'shipped', p2: 'wontdo', p3: 'pending', p4: 'removed' });
    expect(result.delta.shipped).toEqual(['p1']);
    expect(result.delta.wontdo).toEqual(['p2']);
    expect(result.delta.pending).toEqual(['p3']);
    expect(result.delta.removed).toEqual(['p4']);
  });
});
```

### Step 5.2: Run, expect fail

- [ ] Run: `npx vitest run tests/pull-plan-states.test.ts`
  Expected: FAIL "Cannot find module"

### Step 5.3: Implement

- [ ] Create `scripts/pull-plan-states.ts`:

```ts
// Pulls thread states from Figma and computes a status per plan item.
// Parse rule: latest reply matching ^/skip\b wins → wontdo.
// Else: resolved_at !== null → shipped. Else: pending.
// Missing thread (commentId not found) → removed.
import { fetchComments, type FigmaComment } from '../src/figma-client.js';
import { loadState, writeState, type State, type PlanStatus } from '../src/state.js';

const SKIP_RE = /^\/skip\b/i;

export function parseItemStatus(thread: FigmaComment): PlanStatus {
  const replies = [...thread.replies].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const r of replies) {
    if (SKIP_RE.test(r.message.trim())) return 'wontdo';
  }
  if (thread.resolved) return 'shipped';
  return 'pending';
}

export interface PullArgs {
  fileKey: string;
  token: string;
  items: Array<{ id: string; commentId: string; currentStatus: PlanStatus }>;
}

export interface PullResult {
  statuses: Record<string, PlanStatus>;
  delta: { shipped: string[]; wontdo: string[]; pending: string[]; removed: string[] };
}

export async function pullPlanStates(args: PullArgs): Promise<PullResult> {
  const threads = await fetchComments({ fileKey: args.fileKey, token: args.token });
  const byId = new Map(threads.map((t) => [t.id, t]));
  const statuses: Record<string, PlanStatus> = {};
  const delta = { shipped: [] as string[], wontdo: [] as string[], pending: [] as string[], removed: [] as string[] };
  for (const item of args.items) {
    const thread = byId.get(item.commentId);
    const status: PlanStatus = thread ? parseItemStatus(thread) : 'removed';
    statuses[item.id] = status;
    if (status !== item.currentStatus) {
      delta[status].push(item.id);
    } else if (status === 'pending') {
      delta.pending.push(item.id);
    }
  }
  return { statuses, delta };
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , statePath, roundArg, fileKey, token] = process.argv;
  if (!statePath || !roundArg || !fileKey || !token) {
    console.error('Usage: pull-plan-states.ts <statePath> <round> <fileKey> <token>');
    process.exit(1);
  }
  const state = loadState(statePath);
  const round = parseInt(roundArg, 10);
  const planItems = (state.rounds[String(round)]?.plan ?? [])
    .filter((p) => p.commentId)
    .map((p) => ({ id: p.id, commentId: p.commentId!, currentStatus: p.status }));
  pullPlanStates({ fileKey, token, items: planItems })
    .then((result) => {
      const next = JSON.parse(JSON.stringify(state)) as State;
      for (const p of next.rounds[String(round)].plan) {
        const s = result.statuses[p.id];
        if (s) p.status = s;
      }
      writeState(statePath, next);
      process.stdout.write(JSON.stringify(result));
    })
    .catch((err) => { console.error(err.message); process.exit(1); });
}
```

### Step 5.4: Run + commit

- [ ] Run: `npx vitest run tests/pull-plan-states.test.ts`
  Expected: PASS
- [ ] Run: `npx tsc --noEmit`
- [ ] ```bash
git add scripts/pull-plan-states.ts tests/pull-plan-states.test.ts
git commit -m "feat(scripts): pull-plan-states — parse /skip + resolve into per-item status"
```

---

## Task 6: `scripts/cleanup-bot-replies.ts`

**Files:**
- Create: `scripts/cleanup-bot-replies.ts`
- Create: `tests/cleanup-bot-replies.test.ts`

### Step 6.1: Failing test

- [ ] Create `tests/cleanup-bot-replies.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanupBotReplies } from '../scripts/cleanup-bot-replies.js';
import type { State } from '../src/state.js';

function makeState(replies: Array<string | undefined>): State {
  return {
    schemaVersion: 2,
    currentRound: 1,
    currentPhase: 'close',
    rounds: {
      '1': {
        captures: [], pushManifest: null, comments: [], themes: [],
        plan: replies.map((r, i) => ({
          id: `p${i}`, themeName: 'T', change: 'C', drivesFrom: [],
          status: 'shipped' as const, botReplyId: r,
        })),
      },
    },
  };
}

describe('cleanupBotReplies', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('DELETEs every botReplyId present', async () => {
    (fetch as any).mockResolvedValue({ ok: true, status: 200 });
    await cleanupBotReplies({ state: makeState(['r1', 'r2', undefined, 'r3']), round: 1, fileKey: 'k', token: 't' });
    expect((fetch as any).mock.calls.length).toBe(3);
  });

  it('does not throw when there are no replies', async () => {
    await expect(cleanupBotReplies({ state: makeState([]), round: 1, fileKey: 'k', token: 't' })).resolves.toBeUndefined();
  });

  it('tolerates 404 from already-deleted replies', async () => {
    (fetch as any).mockResolvedValue({ ok: false, status: 404, text: async () => 'gone' });
    await expect(cleanupBotReplies({ state: makeState(['r1']), round: 1, fileKey: 'k', token: 't' })).resolves.toBeUndefined();
  });
});
```

### Step 6.2: Run, fail

- [ ] Run: `npx vitest run tests/cleanup-bot-replies.test.ts`
  Expected: FAIL "Cannot find module"

### Step 6.3: Implement

- [ ] Create `scripts/cleanup-bot-replies.ts`:

```ts
import { loadState, type State } from '../src/state.js';
import { deleteComment } from '../src/figma-client.js';

export interface CleanupArgs {
  state: State;
  round: number;
  fileKey: string;
  token: string;
}

export async function cleanupBotReplies(args: CleanupArgs): Promise<void> {
  const r = args.state.rounds[String(args.round)];
  if (!r) return;
  for (const item of r.plan) {
    if (!item.botReplyId) continue;
    await deleteComment({ fileKey: args.fileKey, token: args.token, commentId: item.botReplyId });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , statePath, roundArg, fileKey, token] = process.argv;
  if (!statePath || !roundArg || !fileKey || !token) {
    console.error('Usage: cleanup-bot-replies.ts <statePath> <round> <fileKey> <token>');
    process.exit(1);
  }
  cleanupBotReplies({ state: loadState(statePath), round: parseInt(roundArg, 10), fileKey, token })
    .catch((err) => { console.error(err.message); process.exit(1); });
}
```

### Step 6.4: Run + commit

- [ ] Run: `npx vitest run tests/cleanup-bot-replies.test.ts`
  Expected: PASS
- [ ] Run: `npx tsc --noEmit`
- [ ] ```bash
git add scripts/cleanup-bot-replies.ts tests/cleanup-bot-replies.test.ts
git commit -m "feat(scripts): cleanup-bot-replies — DELETE round's bot reply ids"
```

---

## Task 7: Update `scripts/update-plan.ts`

**Files:**
- Modify: `scripts/update-plan.ts`
- Modify: `tests/update-plan.test.ts`

### Step 7.1: Read current state of files

- [ ] Read `scripts/update-plan.ts` and `tests/update-plan.test.ts` to identify hard-coded status strings.

### Step 7.2: Replace old status values

- [ ] In `scripts/update-plan.ts` and `tests/update-plan.test.ts`, replace every occurrence as follows:
  - `'proposed'` → `'pending'`
  - `'approved'` → `'pending'`
  - `'rejected'` → `'wontdo'`
  - `'dropped'` → `'wontdo'`
  - `'shipped'` → unchanged
- [ ] Add explicit support for `'removed'` if the script switches on status.

### Step 7.3: Run + commit

- [ ] Run: `npx vitest run tests/update-plan.test.ts`
  Expected: PASS
- [ ] Run: `npx tsc --noEmit`
- [ ] ```bash
git add scripts/update-plan.ts tests/update-plan.test.ts
git commit -m "refactor(scripts): update-plan accepts new plan status enum"
```

---

## Task 8: Update `scripts/format-changelog.ts`

**Files:**
- Modify: `scripts/format-changelog.ts`
- Modify: `tests/format-changelog.test.ts`

### Step 8.1: Replace status references

- [ ] In `scripts/format-changelog.ts`, replace `'dropped'` → `'wontdo'`. If the changelog has a "Dropped" or "Deferred" section header, rename it to "Deferred".
- [ ] In `tests/format-changelog.test.ts`, update all fixture status values and any string assertions for section headers.

### Step 8.2: Run + commit

- [ ] Run: `npx vitest run tests/format-changelog.test.ts`
  Expected: PASS
- [ ] ```bash
git add scripts/format-changelog.ts tests/format-changelog.test.ts
git commit -m "refactor(scripts): format-changelog reads wontdo status, renames section to Deferred"
```

---

## Task 9: Update `scripts/render-snapshot.ts`

**Files:**
- Modify: `scripts/render-snapshot.ts`
- Modify: `tests/render-snapshot.test.ts`

### Step 9.1: Replace status references and add Figma link column

- [ ] In `scripts/render-snapshot.ts`, update status mapping:
  - status icons / labels for `pending`, `shipped`, `wontdo`, `removed`
- [ ] Add a column `Figma` that renders `[💬](https://figma.com/file/<fileKey>?node-id=<frameId>#comment-<commentId>)` when `item.commentId` is set, else `—`. Source `fileKey` from config; if not available in this script's context, source from existing imports.
- [ ] Update `tests/render-snapshot.test.ts` to assert the new status icons and the Figma link column.

### Step 9.2: Run + commit

- [ ] Run: `npx vitest run tests/render-snapshot.test.ts`
  Expected: PASS
- [ ] ```bash
git add scripts/render-snapshot.ts tests/render-snapshot.test.ts
git commit -m "refactor(scripts): render-snapshot renders new statuses + Figma comment link column"
```

---

## Task 10: Update `scripts/advance-phase.ts`

**Files:**
- Modify: `scripts/advance-phase.ts`
- Modify: `tests/advance-phase.test.ts`

### Step 10.1: Update accepted phase names

- [ ] In `scripts/advance-phase.ts`, replace any switch/list of phases:
  - drop: `plan-approval`, `implement`
  - add: `plan-ack`
- [ ] In `tests/advance-phase.test.ts`, update phase strings.

### Step 10.2: Run + commit

- [ ] Run: `npx vitest run tests/advance-phase.test.ts`
  Expected: PASS
- [ ] ```bash
git add scripts/advance-phase.ts tests/advance-phase.test.ts
git commit -m "refactor(scripts): advance-phase accepts plan-ack, drops plan-approval/implement"
```

---

## Task 11: New skill `figloops-next-plan-ack`

**Files:**
- Create: `skills/figloops-next-plan-ack/SKILL.md`

### Step 11.1: Create skill file

- [ ] Create `skills/figloops-next-plan-ack/SKILL.md`:

````markdown
---
name: figloops-next-plan-ack
description: Plan-ack phase — render plan frame in Figma, anchor comment threads, refresh on subsequent runs
user-invocable: false
---

## Setup
Resolve `FIGLOOPS_PLUGIN_DIR` from env or `.env`. If unset, abort. Resolve `FIGMA_TOKEN` from env or `.env`. Scripts: `cd "<CONSUMING_REPO>" && "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/<name>.ts" <args>`. Always double-quote paths.

## Style
Status table per round. `AskUserQuestion` options carry no descriptions.

## Errors
TS exits non-zero → relay stderr verbatim, don't advance. MCP failure → prompt user to retry; don't advance.

---

## Handler

1. Mark `[FIGLOOPS] Ack plan in Figma` as `in_progress`.

2. Read `feedback/state.json` and `figloops.config.json` to get `figma.fileKey` and current round.

3. **Mode detection.** If `state.rounds[currentRound].planFrame` is unset → **render+anchor mode** (step 4). Else → **refresh mode** (step 7).

---

### Render + anchor mode

4. **Render frame.** Run:
   ```bash
   PAYLOAD=$("<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/render-plan-frame.ts" "feedback/state.json" <round>)
   ```
   Then invoke `use_figma` with `fileKey: <fileKey>`, `code: "$PAYLOAD"`, `description: "Render Round <N> plan frame"`. Capture the returned JSON: `{pageId, frameId, frameName, rows: [{itemId, index, nodeId}]}`.

5. **Persist frame result + assign rowIndex.** Read state.json, set `rounds[round].planFrame = {pageId, frameId, frameName}`, set `rowIndex` on each plan item from `rows`. Write back.

6. **Anchor threads.** Run:
   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/anchor-plan-threads.ts" "feedback/state.json" <round> "<fileKey>" "$FIGMA_TOKEN"
   ```
   Regenerate snapshot.

   Print:
   ```
   📋 Round <N> plan rendered in Figma — <count> items anchored.

   Open the Figma file and act on each item:
   - ✓ resolve the thread when you've shipped it
   - reply `/skip` to mark won't do
   - leave it open to discuss

   When you're done (or want to check in), re-run `/figloops:next`.
   ```

   Exit. Do not advance.

---

### Refresh mode

7. **Pull thread states.** Run:
   ```bash
   DELTA=$("<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/pull-plan-states.ts" "feedback/state.json" <round> "<fileKey>" "$FIGMA_TOKEN")
   ```
   Parse the JSON: `{statuses: {itemId → status}, delta: {shipped: [], wontdo: [], pending: [], removed: []}}`. The script has already written the new statuses back to state.json.

8. **Recovery check — plan frame deleted.** If any item now has `status: 'removed'` AND it was previously not `'removed'`, run `get_metadata` on `planFrame.frameId` to confirm. If frame is missing too, use `AskUserQuestion`:
   ```
   question: "Plan frame for Round <N> is missing. Re-render?"
   header: "Recovery"
   options:
     - label: "Re-render frame and threads  (Recommended)"
     - label: "Cancel — leave state as-is"
   ```
   - Re-render: clear `planFrame` and clear `commentId`/`botReplyId` on every item, then re-enter render+anchor mode (step 4).
   - Cancel: print the delta and exit.

9. **Print delta.**
   ```
   🔄 Refreshed Round <N> plan

   + <N> newly shipped (<#list>)
   + <N> newly skipped (<#list>)
   = <N> still pending
   ```
   Regenerate snapshot.

10. **Advance check.** Count items by status from the new state.
    - If any item is `pending` → exit. Tell user to keep working in Figma.
    - Else (all `shipped` / `wontdo` / `removed`) → mark task `completed`, run `advance-phase.ts close`, invoke skill `figloops-next-close`.
````

### Step 11.2: Commit

- [ ] ```bash
git add skills/figloops-next-plan-ack/SKILL.md
git commit -m "feat(skill): figloops-next-plan-ack handles render, anchor, and refresh modes"
```

---

## Task 12: Update `skills/figloops-next-cluster/SKILL.md`

**Files:**
- Modify: `skills/figloops-next-cluster/SKILL.md`

### Step 12.1: Update handoff

- [ ] Open the file. Find every reference to `plan-approval` or `figloops-next-plan` and replace:
  - `plan-approval` → `plan-ack`
  - `figloops-next-plan` → `figloops-next-plan-ack`
- [ ] Confirm new plan items are written with `status: 'pending'` (not `'proposed'`). Adjust the handler section accordingly.

### Step 12.2: Commit

- [ ] ```bash
git add skills/figloops-next-cluster/SKILL.md
git commit -m "chore(skill): cluster handoff now targets plan-ack and pending status"
```

---

## Task 13: Update `skills/figloops-next-close/SKILL.md`

**Files:**
- Modify: `skills/figloops-next-close/SKILL.md`

### Step 13.1: Add cleanup step + reduce tracker tasks to 8

- [ ] After step 3 (changelog generation) and before step 8 (snapshot), insert a new step that runs `cleanup-bot-replies.ts <round>` for the closing round. Tolerate failure (delete-on-best-effort).

  Example insertion:
  ```bash
  "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/cleanup-bot-replies.ts" "feedback/state.json" <round> "<fileKey>" "$FIGMA_TOKEN" || echo "Bot reply cleanup failed — non-fatal, continuing."
  ```

- [ ] In step 10 (re-create tracker tasks), change the list from 9 entries to 8:
  - `[FIGLOOPS] Capture screenshots`
  - `[FIGLOOPS] Push to Figma`
  - `[FIGLOOPS] Wait for user comments`
  - `[FIGLOOPS] Pull comments`
  - `[FIGLOOPS] Review comments`
  - `[FIGLOOPS] Cluster themes`
  - `[FIGLOOPS] Ack plan in Figma`
  - `[FIGLOOPS] Close round`

### Step 13.2: Commit

- [ ] ```bash
git add skills/figloops-next-close/SKILL.md
git commit -m "chore(skill): close cleans up bot replies, tracker list reduced to 8"
```

---

## Task 14: Update `skills/figloops-init/SKILL.md`

**Files:**
- Modify: `skills/figloops-init/SKILL.md`

### Step 14.1: Reduce initial task list to 8

- [ ] Find the section that creates the initial 9 `[FIGLOOPS] …` tasks. Replace with the same 8-entry list from Task 13.

### Step 14.2: Commit

- [ ] ```bash
git add skills/figloops-init/SKILL.md
git commit -m "chore(skill): init creates 8 round-tracker tasks"
```

---

## Task 15: Update `skills/figloops/SKILL.md` route table

**Files:**
- Modify: `skills/figloops/SKILL.md`

### Step 15.1: Update route table

- [ ] Open `skills/figloops/SKILL.md`. Replace the rows for `plan-approval` and `implement` with one row:
  ```
  | `plan-ack` | `figloops-next-plan-ack` |
  ```

### Step 15.2: Commit

- [ ] ```bash
git add skills/figloops/SKILL.md
git commit -m "chore(skill): dispatch routes plan-ack to figloops-next-plan-ack"
```

---

## Task 16: Delete old skills

**Files:**
- Delete: `skills/figloops-next-plan/SKILL.md`
- Delete: `skills/figloops-next-implement/SKILL.md`

### Step 16.1: Remove

- [ ] ```bash
git rm -r skills/figloops-next-plan skills/figloops-next-implement
```

### Step 16.2: Commit

- [ ] ```bash
git commit -m "chore: remove plan-approval and implement skills (replaced by plan-ack)"
```

---

## Task 17: Update `README.md`

**Files:**
- Modify: `README.md`

### Step 17.1: Update phase + gate tables

- [ ] In the "What happens in a round" section, replace the 9-row phase table with 8 rows:

  ```markdown
  | # | Phase | Gate |
  |---|---|---|
  | 1 | Capture screenshots | Approve · Re-capture · Cancel |
  | 2 | Push to Figma | — |
  | 3 | Wait for user comments | re-run `:next` when ready |
  | 4 | Pull comments | — |
  | 5 | Review comments | Continue · Pull again · Cancel |
  | 6 | Cluster themes | — |
  | 7 | Ack plan in Figma | Resolve threads or reply `/skip` in Figma; re-run `:next` to advance |
  | 8 | Close round | — |
  ```

- [ ] Update the leading sentence: "`/figloops:next` walks 8 phases. You only have to act at the 4 gates (3 in terminal, 1 in Figma)."

### Step 17.2: Commit

- [ ] ```bash
git add README.md
git commit -m "docs(readme): reflect 8-phase / 4-gate round flow"
```

---

## Task 18: CHANGELOG.md entry

**Files:**
- Modify: `CHANGELOG.md`

### Step 18.1: Add entry

- [ ] Prepend a new section to `CHANGELOG.md`:

  ```markdown
  ## [Unreleased]

  ### Changed
  - **Plan + Implement phases collapsed into Plan-Ack.** Plan approval and implementation tracking now happen on a rendered Figma plan frame. Resolve a comment thread to mark an item shipped; reply `/skip` to drop it.
  - State schema bumped from v1 → v2. Auto-migrates on first load. New plan statuses: `pending`, `shipped`, `wontdo`, `removed` (replacing `proposed`/`approved`/`rejected`/`dropped`).
  - Round phase count: 9 → 8. Gate count: 5 → 4.

  ### Added
  - Figma REST helpers: `postComment`, `postReply`, `deleteComment`.
  - `figloops-next-plan-ack` skill (render + refresh modes).

  ### Removed
  - `figloops-next-plan` and `figloops-next-implement` skills.
  ```

### Step 18.2: Commit

- [ ] ```bash
git add CHANGELOG.md
git commit -m "docs(changelog): plan-ack refactor entry"
```

---

## Task 19: v1 spec deprecation note

**Files:**
- Modify: `docs/superpowers/specs/2026-05-20-figloops-v1-design.md`

### Step 19.1: Add header note

- [ ] At the very top of the file (above the H1), insert:

  ```markdown
  > **Note (2026-06-09):** Sections covering Phase 7 (plan-approval) and Phase 8 (implement) are superseded by [`2026-06-09-figloops-plan-ack-refactor-design.md`](2026-06-09-figloops-plan-ack-refactor-design.md). All other sections remain authoritative.
  ```

### Step 19.2: Commit

- [ ] ```bash
git add docs/superpowers/specs/2026-05-20-figloops-v1-design.md
git commit -m "docs(spec): mark v1 plan/implement sections as superseded"
```

---

## Task 20: End-to-end smoke test checklist

**Files:**
- None to modify. This is a manual procedure documented in this plan and run by the engineer/user.

### Step 20.1: Run smoke test

- [ ] Run all tests: `npx vitest run`
  Expected: all PASS (count should equal previous count plus the new test files: migrations, render-plan-frame, anchor-plan-threads, pull-plan-states, cleanup-bot-replies, plus extended figma-client tests).
- [ ] Run typecheck: `npx tsc --noEmit`
  Expected: no errors.
- [ ] In a scratch consuming repo, run `/figloops:init` and walk through capture → push → … → cluster. Confirm `:next` after cluster auto-runs plan-ack render mode and you see a plan frame appear in Figma with anchor threads.
- [ ] In Figma, resolve one thread (✓) and reply `/skip` on another. Leave a third pending.
- [ ] Run `/figloops:next` again. Confirm the refresh prints the delta showing 1 shipped, 1 skipped, 1 still pending, and that the skill stays on plan-ack.
- [ ] Resolve the pending thread. Run `/figloops:next`. Confirm auto-advance to close, changelog posted, bot replies cleaned up, round bumped.
- [ ] Simulate a deletion: delete the plan frame, run `/figloops:next`, confirm the recovery prompt fires and re-render succeeds.

### Step 20.2: Final commit / PR

- [ ] If any smoke-test step revealed a bug, fix and commit. Otherwise:
- [ ] Confirm `git status` is clean.
- [ ] Open the PR per `superpowers:finishing-a-development-branch`.

---

## Self-review notes (already applied)

- Spec coverage: every section of the design doc maps to a task. Migration covered by Task 1. REST helpers by Task 2. The four new scripts by Tasks 3–6. Modified scripts by Tasks 7–10. Skills by Tasks 11–16. Docs by Tasks 17–19. Smoke by Task 20.
- Type consistency: `PlanStatus = 'pending' | 'shipped' | 'wontdo' | 'removed'` used consistently; phase enum `plan-ack` used consistently; `planFrame` shape `{pageId, frameId, frameName}` matches between `render-plan-frame` result, state schema, and skill handler.
- No placeholders: every code step shows the actual code. Skill handler steps reference exact script names + args.
