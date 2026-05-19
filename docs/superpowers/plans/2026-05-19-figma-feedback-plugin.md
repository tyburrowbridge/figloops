# Figma Feedback Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the figma-feedback-plugin per `docs/superpowers/specs/2026-05-19-figma-feedback-plugin-design.md` — a Claude Code plugin that captures localhost prototypes, pushes them to Figma, ingests stakeholder comments, clusters them by theme, and writes per-round changelogs.

**Architecture:** Node/TypeScript for deterministic operations (Playwright capture, Figma REST API for image uploads and comment fetches, file I/O). A Claude Code skill orchestrates the workflow and calls the Figma MCP server for Figma write operations (page creation, frame creation, image fills, changelog text frames). TS scripts emit structured JSON to stdout so the skill can pipe their output into MCP calls.

**Tech Stack:**
- Node 20+, TypeScript (strict, ESNext target, ESM modules)
- Playwright (headless Chromium capture)
- zod (config validation)
- vitest (unit + integration tests)
- undici/native fetch (Figma REST)
- dotenv (env loading)
- Figma REST API (image upload, comment fetch)
- Official Figma MCP server (write operations — skill-level only)

---

## File structure

Plugin repo files this plan will create:

```
figma-feedback-plugin/
├── .claude-plugin/
│   ├── plugin.json
│   ├── commands/
│   │   ├── figma-feedback-help.md
│   │   ├── figma-feedback-init.md
│   │   ├── figma-feedback-capture.md
│   │   ├── figma-feedback-push.md
│   │   ├── figma-feedback-pull.md
│   │   ├── figma-feedback-plan.md
│   │   └── figma-feedback-close-round.md
│   └── skills/
│       └── figma-feedback/SKILL.md
├── src/
│   ├── config.ts
│   ├── round-state.ts
│   └── figma-client.ts
├── scripts/
│   ├── capture.ts
│   ├── upload-images.ts
│   ├── pull-comments.ts
│   └── format-changelog.ts
├── tests/
│   ├── config.test.ts
│   ├── round-state.test.ts
│   ├── figma-client.test.ts
│   ├── format-changelog.test.ts
│   ├── capture.integration.test.ts
│   └── fixtures/
│       ├── valid-config.json
│       ├── invalid-config-missing-routes.json
│       ├── figma-comments-response.json
│       ├── plan-sample.md
│       └── addressed-sample.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── config.schema.json
├── .env.example
└── README.md
```

**Boundaries:**
- `src/` = pure modules with isolated responsibilities, testable in isolation
- `scripts/` = executable entry points that compose `src/` modules and emit stdout JSON
- `.claude-plugin/` = user-facing plugin surface (commands, skill, manifest)
- `tests/` = vitest tests + fixtures

The skill is the only place that touches both TS and MCP. TS scripts never call MCP. MCP calls are described in `SKILL.md` and made by Claude when executing the skill.

---

## Conventions used by every task

- **Working directory** for all commands: `/Users/tburrowbridge/GitHub/figma-feedback-plugin`
- **Test runner:** `npx vitest run <file>` for one file, `npx vitest run` for all
- **TypeScript runner for scripts:** `npx tsx scripts/<name>.ts` (tsx is added in Task 1)
- **Module system:** ESM (`"type": "module"` in package.json, `.ts` files use `import`/`export`)
- **Every task ends in a commit** using the format `<verb>: <short description>` (e.g., `feat: add config loader`)
- **Stdout JSON contract:** scripts that produce structured output write a single JSON object to stdout. Logs/progress go to stderr.

---

## Task 1: Initialize Node project + dependencies

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Modify: `.gitignore` (already exists from initial commit)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "figma-feedback-plugin",
  "version": "0.1.0",
  "description": "Claude Code plugin: capture localhost prototypes into Figma for stakeholder review",
  "type": "module",
  "private": true,
  "scripts": {
    "build": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "playwright": "^1.49.0",
    "undici": "^6.21.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.17.10",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: completes without errors; `node_modules/` and `package-lock.json` appear.

- [ ] **Step 3: Install Playwright browser**

Run: `npx playwright install chromium`
Expected: downloads Chromium (~150MB), completes successfully.

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "allowImportingTsExtensions": false,
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "scripts/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 6: Verify TS config compiles**

Run: `npx tsc --noEmit`
Expected: exits 0 with no output (no source files yet).

- [ ] **Step 7: Verify vitest runs**

Run: `npx vitest run`
Expected: "No test files found" message, exit code 0.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts
git commit -m "chore: scaffold Node + TypeScript + vitest project"
```

---

## Task 2: Add `.env.example` and `config.schema.json`

**Files:**
- Create: `.env.example`
- Create: `config.schema.json`

- [ ] **Step 1: Create `.env.example`**

```
# Figma Personal Access Token — generate at https://www.figma.com/developers/api#access-tokens
# Used only by TS scripts (REST image upload, REST comment fetch).
# The Figma MCP server has its own authentication, configured separately
# at the Claude Code MCP-setup level.
FIGMA_TOKEN=figd_REPLACE_ME

# Absolute path to where the figma-feedback-plugin is installed (e.g.,
# ~/.claude/plugins/figma-feedback-plugin). The plugin's skill uses this
# to locate its TS helper scripts when running from the consuming repo.
# /figma-feedback-init will help you fill this in.
FIGMA_FEEDBACK_PLUGIN_DIR=/absolute/path/to/figma-feedback-plugin
```

- [ ] **Step 2: Create `config.schema.json`** (JSON Schema for editor linting)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "figma-feedback.config.json",
  "type": "object",
  "required": ["devServer", "viewport", "figma", "routes"],
  "properties": {
    "devServer": {
      "type": "object",
      "required": ["url"],
      "properties": {
        "url": { "type": "string", "format": "uri" },
        "waitFor": {
          "oneOf": [
            { "const": "networkidle" },
            { "const": "load" },
            { "const": "domcontentloaded" }
          ]
        }
      }
    },
    "viewport": {
      "type": "object",
      "required": ["width", "height"],
      "properties": {
        "width":  { "type": "integer", "minimum": 200 },
        "height": { "type": "integer", "minimum": 200 }
      }
    },
    "figma": {
      "type": "object",
      "required": ["fileKey", "changelogPageName"],
      "properties": {
        "fileKey":           { "type": "string", "minLength": 1 },
        "changelogPageName": { "type": "string", "minLength": 1 }
      }
    },
    "routes": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["label", "path"],
        "properties": {
          "label":   { "type": "string", "minLength": 1 },
          "path":    { "type": "string", "pattern": "^/" },
          "waitFor": { "type": "string" }
        }
      }
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add .env.example config.schema.json
git commit -m "chore: add .env.example and config JSON schema"
```

---

## Task 3: `src/config.ts` — zod schema (TDD)

**Files:**
- Create: `tests/config.test.ts`
- Create: `tests/fixtures/valid-config.json`
- Create: `tests/fixtures/invalid-config-missing-routes.json`
- Create: `src/config.ts`

- [ ] **Step 1: Create fixture `tests/fixtures/valid-config.json`**

```json
{
  "devServer": { "url": "http://localhost:3000", "waitFor": "networkidle" },
  "viewport":  { "width": 1440, "height": 900 },
  "figma":     { "fileKey": "abc123", "changelogPageName": "Changelog" },
  "routes": [
    { "label": "Login",     "path": "/login" },
    { "label": "Dashboard", "path": "/dashboard", "waitFor": "[data-loaded]" }
  ]
}
```

- [ ] **Step 2: Create fixture `tests/fixtures/invalid-config-missing-routes.json`**

```json
{
  "devServer": { "url": "http://localhost:3000" },
  "viewport":  { "width": 1440, "height": 900 },
  "figma":     { "fileKey": "abc123", "changelogPageName": "Changelog" }
}
```

- [ ] **Step 3: Write failing tests in `tests/config.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { configSchema } from '../src/config.js';

const here = dirname(fileURLToPath(import.meta.url));
const readFixture = (name: string) =>
  JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8'));

describe('configSchema', () => {
  it('accepts a fully populated valid config', () => {
    const data = readFixture('valid-config.json');
    const result = configSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('accepts config when route.waitFor is omitted', () => {
    const data = readFixture('valid-config.json');
    delete data.routes[0].waitFor;
    expect(configSchema.safeParse(data).success).toBe(true);
  });

  it('rejects config with missing routes field', () => {
    const data = readFixture('invalid-config-missing-routes.json');
    const result = configSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('routes');
    }
  });

  it('rejects routes with a path that does not start with /', () => {
    const data = readFixture('valid-config.json');
    data.routes[0].path = 'login';
    const result = configSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects empty routes array', () => {
    const data = readFixture('valid-config.json');
    data.routes = [];
    expect(configSchema.safeParse(data).success).toBe(false);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run tests/config.test.ts`
Expected: tests fail because `../src/config.js` cannot be resolved.

- [ ] **Step 5: Implement `src/config.ts`**

```ts
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
```

- [ ] **Step 6: Run tests again to verify they pass**

Run: `npx vitest run tests/config.test.ts`
Expected: all 5 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/config.ts tests/config.test.ts tests/fixtures/
git commit -m "feat: add config zod schema with validation tests"
```

---

## Task 4: `src/config.ts` — `loadConfig()` function (TDD)

**Files:**
- Modify: `src/config.ts`
- Modify: `tests/config.test.ts`

- [ ] **Step 1: Add failing tests for `loadConfig()`**

Append to `tests/config.test.ts`:

```ts
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fb-cfg-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('loads and validates a valid config file', () => {
    const data = readFixture('valid-config.json');
    const path = join(dir, 'figma-feedback.config.json');
    writeFileSync(path, JSON.stringify(data));
    const cfg = loadConfig(path);
    expect(cfg.routes).toHaveLength(2);
    expect(cfg.devServer.waitFor).toBe('networkidle');
  });

  it('throws a clear error with field paths when invalid', () => {
    const data = readFixture('invalid-config-missing-routes.json');
    const path = join(dir, 'bad.json');
    writeFileSync(path, JSON.stringify(data));
    expect(() => loadConfig(path)).toThrowError(/routes/);
  });

  it('throws if the file is missing', () => {
    expect(() => loadConfig(join(dir, 'nope.json'))).toThrowError(/ENOENT|not found/i);
  });
});
```

Also add the missing imports at the top of the test file:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
```

(Replace the existing `import { describe, it, expect }` line.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/config.test.ts`
Expected: `loadConfig` import fails — 3 new tests error out.

- [ ] **Step 3: Add `loadConfig` to `src/config.ts`**

Append:

```ts
import { readFileSync } from 'node:fs';

export function loadConfig(path: string): Config {
  const raw = readFileSync(path, 'utf8');
  const data: unknown = JSON.parse(raw);
  const result = configSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid config at ${path}:\n${issues}`);
  }
  return result.data;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/config.test.ts`
Expected: all 8 tests pass (5 schema + 3 loadConfig).

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add loadConfig with file-path errors"
```

---

## Task 5: `src/round-state.ts` + `scripts/init-state.ts` (TDD)

**Files:**
- Create: `tests/round-state.test.ts`
- Create: `src/round-state.ts`
- Create: `scripts/init-state.ts`

- [ ] **Step 1: Write failing tests in `tests/round-state.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readRoundState,
  writeRoundState,
  bumpRound,
  initRoundState,
} from '../src/round-state.js';

describe('round-state', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fb-rs-'));
    path = join(dir, '.round-state.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('initRoundState creates file with currentRound: 1', () => {
    initRoundState(path);
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ currentRound: 1 });
  });

  it('initRoundState refuses to overwrite an existing file', () => {
    writeFileSync(path, JSON.stringify({ currentRound: 5 }));
    expect(() => initRoundState(path)).toThrowError(/already exists/);
  });

  it('readRoundState returns the current round', () => {
    writeFileSync(path, JSON.stringify({ currentRound: 7 }));
    expect(readRoundState(path)).toEqual({ currentRound: 7 });
  });

  it('readRoundState throws if file missing', () => {
    expect(() => readRoundState(path)).toThrowError(/not found|ENOENT/i);
  });

  it('writeRoundState writes to disk', () => {
    writeRoundState(path, { currentRound: 3 });
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ currentRound: 3 });
  });

  it('bumpRound increments and persists', () => {
    writeFileSync(path, JSON.stringify({ currentRound: 2 }));
    const next = bumpRound(path);
    expect(next).toBe(3);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ currentRound: 3 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/round-state.test.ts`
Expected: import errors for the missing module.

- [ ] **Step 3: Implement `src/round-state.ts`**

```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export interface RoundState {
  currentRound: number;
}

export function readRoundState(path: string): RoundState {
  if (!existsSync(path)) {
    throw new Error(`Round state file not found at ${path}. Run /figma-feedback-init first.`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as RoundState;
}

export function writeRoundState(path: string, state: RoundState): void {
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
}

export function initRoundState(path: string): void {
  if (existsSync(path)) {
    throw new Error(`Round state file already exists at ${path}; refusing to overwrite.`);
  }
  writeRoundState(path, { currentRound: 1 });
}

export function bumpRound(path: string): number {
  const state = readRoundState(path);
  const next = { currentRound: state.currentRound + 1 };
  writeRoundState(path, next);
  return next.currentRound;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/round-state.test.ts`
Expected: all 6 tests pass.

- [ ] **Step 5: Add `scripts/init-state.ts` CLI wrapper**

This thin wrapper lets the skill initialize round state without inlining shell quoting tricks.

```ts
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { initRoundState } from '../src/round-state.js';

function main() {
  const cwd = process.cwd();
  const dir = join(cwd, 'feedback');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, '.round-state.json');
  initRoundState(path);
  process.stdout.write(JSON.stringify({ initialized: path, currentRound: 1 }, null, 2));
}

try {
  main();
} catch (err) {
  process.stderr.write(`[init-state] fatal: ${(err as Error).message}\n`);
  process.exit(1);
}
```

- [ ] **Step 6: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/round-state.ts scripts/init-state.ts tests/round-state.test.ts
git commit -m "feat: add round-state module + init-state CLI wrapper"
```

---

## Task 6: `src/figma-client.ts` — `uploadImage()` (TDD)

**Files:**
- Create: `tests/figma-client.test.ts`
- Create: `src/figma-client.ts`

**Note for the engineer:** Figma's REST image upload endpoint is `POST https://api.figma.com/v1/images/<file_key>` with the `X-Figma-Token` header and a `multipart/form-data` body containing the image file(s). The response shape contains an `images` object mapping client-provided keys to uploaded URLs/hashes. **Verify the exact response shape against [Figma's API docs](https://www.figma.com/developers/api#post-images) when wiring fixtures.** The wrapper below assumes a response of `{ meta: { images: { [name: string]: string } }, status: number }`. If reality differs, update the parser and tests together.

- [ ] **Step 1: Write failing tests in `tests/figma-client.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uploadImage } from '../src/figma-client.js';

describe('uploadImage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to the correct URL with token header', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ meta: { images: { 'login.png': 'hash-abc' } } }),
    });

    await uploadImage({
      fileKey: 'abc123',
      token: 'tok',
      filename: 'login.png',
      bytes: Buffer.from([0x89, 0x50]),
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe('https://api.figma.com/v1/images/abc123');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Figma-Token']).toBe('tok');
  });

  it('returns the image hash on success', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ meta: { images: { 'login.png': 'hash-abc' } } }),
    });

    const hash = await uploadImage({
      fileKey: 'abc123',
      token: 'tok',
      filename: 'login.png',
      bytes: Buffer.from([0x89]),
    });

    expect(hash).toBe('hash-abc');
  });

  it('throws with status and body on 4xx', async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden: bad token',
    });

    await expect(
      uploadImage({
        fileKey: 'abc123',
        token: 'bad',
        filename: 'x.png',
        bytes: Buffer.from([0]),
      }),
    ).rejects.toThrowError(/403.*Forbidden/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/figma-client.test.ts`
Expected: import errors for `../src/figma-client.js`.

- [ ] **Step 3: Implement `src/figma-client.ts` (uploadImage only)**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/figma-client.test.ts`
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/figma-client.ts tests/figma-client.test.ts
git commit -m "feat: add Figma REST uploadImage with error handling"
```

---

## Task 7: `src/figma-client.ts` — `fetchComments()` (TDD)

**Files:**
- Modify: `src/figma-client.ts`
- Modify: `tests/figma-client.test.ts`
- Create: `tests/fixtures/figma-comments-response.json`

- [ ] **Step 1: Create fixture `tests/fixtures/figma-comments-response.json`**

A representative response shape from Figma's `GET /v1/files/:key/comments`:

```json
{
  "comments": [
    {
      "id": "12345",
      "message": "Make this button bigger",
      "client_meta": { "node_id": "1:42", "node_offset": { "x": 100, "y": 200 } },
      "user": { "id": "u1", "handle": "Sarah" },
      "created_at": "2026-05-19T10:00:00Z",
      "resolved_at": null
    },
    {
      "id": "12346",
      "message": "Nav is confusing",
      "client_meta": { "node_id": "1:42", "node_offset": { "x": 50, "y": 80 } },
      "user": { "id": "u2", "handle": "Mike" },
      "created_at": "2026-05-19T10:05:00Z",
      "resolved_at": null
    },
    {
      "id": "12347",
      "message": "Unrelated comment on another frame",
      "client_meta": { "node_id": "9:99" },
      "user": { "id": "u1", "handle": "Sarah" },
      "created_at": "2026-05-19T10:10:00Z",
      "resolved_at": "2026-05-19T10:11:00Z"
    }
  ]
}
```

- [ ] **Step 2: Add failing tests for `fetchComments`**

Append to `tests/figma-client.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchComments } from '../src/figma-client.js';

const here = dirname(fileURLToPath(import.meta.url));
const readFixture = (name: string) =>
  JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8'));

describe('fetchComments', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GETs the correct URL with token header', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => readFixture('figma-comments-response.json'),
    });

    await fetchComments({ fileKey: 'abc123', token: 'tok' });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe('https://api.figma.com/v1/files/abc123/comments');
    expect(init.method).toBe('GET');
    expect(init.headers['X-Figma-Token']).toBe('tok');
  });

  it('returns an array of parsed comments', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => readFixture('figma-comments-response.json'),
    });

    const comments = await fetchComments({ fileKey: 'abc123', token: 'tok' });
    expect(comments).toHaveLength(3);
    expect(comments[0]).toMatchObject({
      id: '12345',
      message: 'Make this button bigger',
      nodeId: '1:42',
      author: 'Sarah',
      resolved: false,
    });
    expect(comments[2].resolved).toBe(true);
  });

  it('throws on 4xx', async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    await expect(
      fetchComments({ fileKey: 'abc123', token: 'bad' }),
    ).rejects.toThrowError(/401.*Unauthorized/);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/figma-client.test.ts`
Expected: `fetchComments` import fails; 3 new tests error.

- [ ] **Step 4: Add `fetchComments` to `src/figma-client.ts`**

Append:

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/figma-client.test.ts`
Expected: all 6 tests pass (3 upload + 3 fetchComments).

- [ ] **Step 6: Commit**

```bash
git add src/figma-client.ts tests/figma-client.test.ts tests/fixtures/figma-comments-response.json
git commit -m "feat: add fetchComments with parsed response shape"
```

---

## Task 8: `src/figma-client.ts` — `filterCommentsByFrameIds()` (TDD)

A pure function used by `pull-comments.ts` to keep only the comments anchored to the current round's frames.

**Files:**
- Modify: `src/figma-client.ts`
- Modify: `tests/figma-client.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/figma-client.test.ts`:

```ts
import { filterCommentsByFrameIds } from '../src/figma-client.js';

describe('filterCommentsByFrameIds', () => {
  const sample: any[] = [
    { id: '1', nodeId: '1:42', message: 'a', author: 'A', createdAt: 't1', resolved: false },
    { id: '2', nodeId: '1:43', message: 'b', author: 'B', createdAt: 't2', resolved: false },
    { id: '3', nodeId: '9:99', message: 'c', author: 'C', createdAt: 't3', resolved: false },
    { id: '4', nodeId: null,   message: 'd', author: 'D', createdAt: 't4', resolved: false },
  ];

  it('returns only comments whose nodeId is in the allow set', () => {
    const out = filterCommentsByFrameIds(sample, new Set(['1:42', '1:43']));
    expect(out.map((c) => c.id)).toEqual(['1', '2']);
  });

  it('returns empty array when no comments match', () => {
    expect(filterCommentsByFrameIds(sample, new Set(['nope']))).toEqual([]);
  });

  it('excludes comments with null nodeId', () => {
    const out = filterCommentsByFrameIds(sample, new Set(['1:42', '1:43', '9:99']));
    expect(out.map((c) => c.id)).toEqual(['1', '2', '3']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/figma-client.test.ts`
Expected: import error for `filterCommentsByFrameIds`.

- [ ] **Step 3: Add the function to `src/figma-client.ts`**

Append:

```ts
export function filterCommentsByFrameIds(
  comments: FigmaComment[],
  allowed: Set<string>,
): FigmaComment[] {
  return comments.filter((c) => c.nodeId !== null && allowed.has(c.nodeId));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/figma-client.test.ts`
Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/figma-client.ts tests/figma-client.test.ts
git commit -m "feat: add filterCommentsByFrameIds pure helper"
```

---

## Task 9: `scripts/format-changelog.ts` (TDD)

A pure markdown formatter. Reads `plan.md` and `addressed.md` from a round directory, returns a formatted changelog block for the Figma changelog frame.

**Files:**
- Create: `tests/fixtures/plan-sample.md`
- Create: `tests/fixtures/addressed-sample.md`
- Create: `tests/format-changelog.test.ts`
- Create: `scripts/format-changelog.ts`

- [ ] **Step 1: Create `tests/fixtures/plan-sample.md`**

```markdown
## Proposed changes

### Theme: Navigation clarity
1. [x] Add breadcrumbs to Dashboard
   Drives from: #12, #17
2. [ ] Move user menu to top-right
   Drives from: #22

### Theme: Color contrast
3. [x] Increase contrast on disabled buttons
   Drives from: #31
```

- [ ] **Step 2: Create `tests/fixtures/addressed-sample.md`**

```markdown
- Added breadcrumbs to Dashboard. Drove from: #12, #17
- Increased contrast on disabled buttons. Drove from: #31
```

- [ ] **Step 3: Write failing tests in `tests/format-changelog.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { formatChangelog } from '../scripts/format-changelog.js';

const here = dirname(fileURLToPath(import.meta.url));
const readFixture = (name: string) => readFileSync(join(here, 'fixtures', name), 'utf8');

describe('formatChangelog', () => {
  it('produces a round summary grouped by theme', () => {
    const out = formatChangelog({
      fromRound: 2,
      toRound: 3,
      date: '2026-05-19',
      plan: readFixture('plan-sample.md'),
      addressed: readFixture('addressed-sample.md'),
    });

    expect(out).toContain('## Round 2 → Round 3 (2026-05-19)');
    expect(out).toContain('### Theme: Navigation clarity');
    expect(out).toContain('- Added breadcrumbs to Dashboard');
    expect(out).toContain('Drove from: #12, #17');
    expect(out).toContain('### Theme: Color contrast');
    expect(out).toContain('- Increased contrast on disabled buttons');
  });

  it('omits themes whose items were not addressed', () => {
    const out = formatChangelog({
      fromRound: 2,
      toRound: 3,
      date: '2026-05-19',
      plan: readFixture('plan-sample.md'),
      addressed: '- Increased contrast on disabled buttons. Drove from: #31',
    });

    expect(out).not.toContain('Navigation clarity');
    expect(out).toContain('Color contrast');
  });

  it('produces a "no changes" note when addressed.md is empty', () => {
    const out = formatChangelog({
      fromRound: 2,
      toRound: 3,
      date: '2026-05-19',
      plan: readFixture('plan-sample.md'),
      addressed: '',
    });
    expect(out).toContain('## Round 2 → Round 3 (2026-05-19)');
    expect(out).toContain('_No changes implemented this round._');
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run tests/format-changelog.test.ts`
Expected: import errors for the script.

- [ ] **Step 5: Implement `scripts/format-changelog.ts`**

```ts
export interface FormatChangelogArgs {
  fromRound: number;
  toRound: number;
  date: string;
  plan: string;
  addressed: string;
}

interface PlanItem {
  text: string;
  drivers: string;
  theme: string;
}

function parsePlan(plan: string): PlanItem[] {
  const items: PlanItem[] = [];
  let currentTheme = '';
  const lines = plan.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const themeMatch = line.match(/^###\s+Theme:\s*(.+?)\s*$/);
    if (themeMatch) {
      currentTheme = themeMatch[1];
      continue;
    }
    const itemMatch = line.match(/^\d+\.\s*\[[ x]\]\s*(.+?)\s*$/);
    if (itemMatch && currentTheme) {
      const text = itemMatch[1];
      const next = lines[i + 1] ?? '';
      const driverMatch = next.match(/^\s*Drives from:\s*(.+?)\s*$/);
      items.push({
        text,
        drivers: driverMatch ? driverMatch[1] : '',
        theme: currentTheme,
      });
    }
  }
  return items;
}

function parseAddressed(addressed: string): string[] {
  return addressed
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim());
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[.,]/g, '').trim();
}

export function formatChangelog(args: FormatChangelogArgs): string {
  const planItems = parsePlan(args.plan);
  const addressedLines = parseAddressed(args.addressed);
  const header = `## Round ${args.fromRound} → Round ${args.toRound} (${args.date})`;

  if (addressedLines.length === 0) {
    return `${header}\n\n_No changes implemented this round._\n`;
  }

  // Group addressed lines by matching theme via plan items.
  const byTheme = new Map<string, string[]>();

  for (const addr of addressedLines) {
    const addrNorm = normalizeForMatch(addr);
    const match = planItems.find((p) => addrNorm.includes(normalizeForMatch(p.text)));
    const theme = match?.theme ?? 'Other';
    if (!byTheme.has(theme)) byTheme.set(theme, []);
    byTheme.get(theme)!.push(addr);
  }

  const parts = [header, ''];
  for (const [theme, lines] of byTheme) {
    parts.push(`### Theme: ${theme}`);
    for (const line of lines) {
      const driveMatch = line.match(/(.+?)\s*Drove from:\s*(.+)$/);
      if (driveMatch) {
        parts.push(`- ${driveMatch[1].trim()}`);
        parts.push(`  Drove from: ${driveMatch[2].trim()}`);
      } else {
        parts.push(`- ${line}`);
      }
    }
    parts.push('');
  }
  return parts.join('\n').trimEnd() + '\n';
}

// CLI entry point: called by /figma-feedback-close-round.
// Usage: tsx scripts/format-changelog.ts <fromRound> <toRound> <date> <planPath> <addressedPath>
async function main() {
  const [fromRound, toRound, date, planPath, addressedPath] = process.argv.slice(2);
  if (!fromRound || !toRound || !date || !planPath || !addressedPath) {
    process.stderr.write(
      'Usage: tsx scripts/format-changelog.ts <fromRound> <toRound> <date> <planPath> <addressedPath>\n',
    );
    process.exit(1);
  }
  const { readFileSync } = await import('node:fs');
  process.stdout.write(
    formatChangelog({
      fromRound: Number(fromRound),
      toRound: Number(toRound),
      date,
      plan: readFileSync(planPath, 'utf8'),
      addressed: readFileSync(addressedPath, 'utf8'),
    }),
  );
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`[format-changelog] fatal: ${err.message}\n`);
    process.exit(1);
  });
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/format-changelog.test.ts`
Expected: all 3 tests pass.

- [ ] **Step 7: Commit**

```bash
git add scripts/format-changelog.ts tests/format-changelog.test.ts tests/fixtures/plan-sample.md tests/fixtures/addressed-sample.md
git commit -m "feat: add format-changelog pure markdown formatter"
```

---

## Task 10: `scripts/capture.ts` (Playwright + integration test)

**Files:**
- Create: `tests/capture.integration.test.ts`
- Create: `scripts/capture.ts`

The script reads the config + a round number, drives Playwright across each route, writes PNGs to `<consumingRepo>/feedback/round-<N>/captures/<NN>-<label>.png`, and prints a JSON summary to stdout.

- [ ] **Step 1: Write failing integration test in `tests/capture.integration.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, Server } from 'node:http';
import { mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { capture } from '../scripts/capture.js';

let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    if (req.url === '/login') {
      res.end('<html><body style="background:#f0a"><h1>Login</h1></body></html>');
    } else if (req.url === '/dashboard') {
      res.end('<html><body style="background:#0af"><h1>Dashboard</h1></body></html>');
    } else {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      port = (server.address() as any).port;
      resolve();
    });
  });
}, 30_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('capture (integration)', () => {
  it('captures all routes and writes PNGs', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'fb-cap-'));
    try {
      const result = await capture({
        outputDir: outDir,
        viewport: { width: 800, height: 600 },
        baseUrl: `http://localhost:${port}`,
        waitFor: 'load',
        routes: [
          { label: 'Login',     path: '/login' },
          { label: 'Dashboard', path: '/dashboard' },
        ],
      });

      expect(result.captures).toHaveLength(2);
      expect(result.captures[0].path).toMatch(/01-login\.png$/);
      expect(result.captures[1].path).toMatch(/02-dashboard\.png$/);

      for (const c of result.captures) {
        expect(statSync(c.path).size).toBeGreaterThan(0);
      }
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 60_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/capture.integration.test.ts`
Expected: import error.

- [ ] **Step 3: Implement `scripts/capture.ts`**

```ts
import { chromium, type Browser } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { readRoundState } from '../src/round-state.js';

export interface CaptureRoute {
  label: string;
  path: string;
  waitFor?: string;
}

export interface CaptureArgs {
  outputDir: string;
  viewport: { width: number; height: number };
  baseUrl: string;
  waitFor: 'networkidle' | 'load' | 'domcontentloaded';
  routes: CaptureRoute[];
}

export interface CaptureResult {
  captures: Array<{ label: string; path: string }>;
  failed: Array<{ label: string; error: string }>;
}

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function capture(args: CaptureArgs): Promise<CaptureResult> {
  mkdirSync(args.outputDir, { recursive: true });
  const browser: Browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: args.viewport });
    const page = await ctx.newPage();
    const captures: CaptureResult['captures'] = [];
    const failed: CaptureResult['failed'] = [];

    for (let i = 0; i < args.routes.length; i++) {
      const r = args.routes[i];
      const url = new URL(r.path, args.baseUrl).toString();
      const filename = `${String(i + 1).padStart(2, '0')}-${slug(r.label)}.png`;
      const out = join(args.outputDir, filename);
      try {
        await page.goto(url, { waitUntil: args.waitFor, timeout: 30_000 });
        if (r.waitFor) {
          await page.waitForSelector(r.waitFor, { timeout: 10_000 });
        }
        await page.screenshot({ path: out, fullPage: true });
        captures.push({ label: r.label, path: out });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failed.push({ label: r.label, error: message });
        process.stderr.write(`[capture] skipped ${r.label}: ${message}\n`);
      }
    }
    return { captures, failed };
  } finally {
    await browser.close();
  }
}

// CLI entry point: invoked by /figma-feedback-capture
async function main() {
  const cwd = process.cwd();
  const config = loadConfig(join(cwd, 'figma-feedback.config.json'));
  const state = readRoundState(join(cwd, 'feedback', '.round-state.json'));
  const outDir = join(cwd, 'feedback', `round-${state.currentRound}`, 'captures');

  const result = await capture({
    outputDir: outDir,
    viewport: config.viewport,
    baseUrl: config.devServer.url,
    waitFor: config.devServer.waitFor,
    routes: config.routes,
  });

  process.stdout.write(JSON.stringify({ round: state.currentRound, ...result }, null, 2));
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`[capture] fatal: ${err.message}\n`);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/capture.integration.test.ts`
Expected: 1 test passes within 60s. (Chromium download must have completed in Task 1 Step 3.)

- [ ] **Step 5: Commit**

```bash
git add scripts/capture.ts tests/capture.integration.test.ts
git commit -m "feat: add Playwright capture script with fixture-server test"
```

---

## Task 11: `scripts/upload-images.ts` (orchestrator)

**Files:**
- Create: `scripts/upload-images.ts`

Reads the capture manifest from the current round's `captures/` directory, uploads each PNG via Figma REST, prints a JSON map `{ label, filename, imageHash }` to stdout. The skill will pass these hashes into MCP frame-creation calls.

This script has no new unit tests of its own — `uploadImage` is already tested. The verification is via the manual smoke test in the README.

- [ ] **Step 1: Implement `scripts/upload-images.ts`**

```ts
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { loadConfig } from '../src/config.js';
import { readRoundState } from '../src/round-state.js';
import { uploadImage } from '../src/figma-client.js';

interface UploadOutput {
  round: number;
  uploads: Array<{ label: string; filename: string; imageHash: string }>;
  failed: Array<{ filename: string; error: string }>;
}

function labelFromFilename(filename: string): string {
  // "01-login.png" -> "Login"; "03-user-settings.png" -> "User Settings"
  const stem = filename.replace(/\.png$/i, '').replace(/^\d+-/, '');
  return stem
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

async function main() {
  loadEnv();
  const token = process.env.FIGMA_TOKEN;
  if (!token || token === 'figd_REPLACE_ME') {
    process.stderr.write(
      'FIGMA_TOKEN missing. Generate one at https://www.figma.com/developers/api#access-tokens and add to .env\n',
    );
    process.exit(1);
  }

  const cwd = process.cwd();
  const config = loadConfig(join(cwd, 'figma-feedback.config.json'));
  const state = readRoundState(join(cwd, 'feedback', '.round-state.json'));
  const capturesDir = join(cwd, 'feedback', `round-${state.currentRound}`, 'captures');

  if (!existsSync(capturesDir)) {
    process.stderr.write(`No captures directory at ${capturesDir}. Run /figma-feedback-capture first.\n`);
    process.exit(1);
  }

  const files = readdirSync(capturesDir).filter((f) => f.endsWith('.png')).sort();
  const out: UploadOutput = { round: state.currentRound, uploads: [], failed: [] };

  for (const filename of files) {
    const bytes = readFileSync(join(capturesDir, filename));
    try {
      const hash = await uploadImage({
        fileKey: config.figma.fileKey,
        token,
        filename,
        bytes,
      });
      out.uploads.push({ label: labelFromFilename(filename), filename, imageHash: hash });
      process.stderr.write(`[upload] ${filename} -> ${hash}\n`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      out.failed.push({ filename, error: message });
      process.stderr.write(`[upload] FAILED ${filename}: ${message}\n`);
    }
  }

  process.stdout.write(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  process.stderr.write(`[upload-images] fatal: ${err.message}\n`);
  process.exit(1);
});
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: exits 0 with no errors. (`tsc` checks the whole project; this verifies the new script fits with the rest.)

- [ ] **Step 3: Commit**

```bash
git add scripts/upload-images.ts
git commit -m "feat: add upload-images orchestrator script"
```

---

## Task 12: `scripts/pull-comments.ts` (orchestrator)

**Files:**
- Create: `scripts/pull-comments.ts`

Reads the round's `push-manifest.json` to get frame IDs, fetches all comments from Figma, filters to ones anchored to those frames, writes `comments.json` to the round directory, and prints a summary to stdout.

- [ ] **Step 1: Implement `scripts/pull-comments.ts`**

```ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { loadConfig } from '../src/config.js';
import { readRoundState } from '../src/round-state.js';
import { fetchComments, filterCommentsByFrameIds, type FigmaComment } from '../src/figma-client.js';

interface PushManifest {
  round: number;
  page_id: string;
  frames: Array<{ label: string; frame_id: string; image_hash: string }>;
}

async function main() {
  loadEnv();
  const token = process.env.FIGMA_TOKEN;
  if (!token || token === 'figd_REPLACE_ME') {
    process.stderr.write('FIGMA_TOKEN missing in .env\n');
    process.exit(1);
  }

  const cwd = process.cwd();
  const config = loadConfig(join(cwd, 'figma-feedback.config.json'));
  const state = readRoundState(join(cwd, 'feedback', '.round-state.json'));
  const roundDir = join(cwd, 'feedback', `round-${state.currentRound}`);
  const manifestPath = join(roundDir, 'push-manifest.json');

  if (!existsSync(manifestPath)) {
    process.stderr.write(
      `No push-manifest.json at ${manifestPath}. Run /figma-feedback-push first.\n`,
    );
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PushManifest;
  const allowedFrameIds = new Set(manifest.frames.map((f) => f.frame_id));

  const all = await fetchComments({ fileKey: config.figma.fileKey, token });
  const filtered = filterCommentsByFrameIds(all, allowedFrameIds);

  // Attach the frame label to each comment for downstream readability
  const frameById = new Map(manifest.frames.map((f) => [f.frame_id, f.label]));
  const enriched = filtered.map((c) => ({
    ...c,
    frame_label: c.nodeId ? frameById.get(c.nodeId) ?? null : null,
  }));

  const outPath = join(roundDir, 'comments.json');
  writeFileSync(outPath, JSON.stringify(enriched, null, 2) + '\n');

  process.stdout.write(
    JSON.stringify(
      {
        round: state.currentRound,
        totalComments: all.length,
        forThisRound: enriched.length,
        wroteTo: outPath,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  process.stderr.write(`[pull-comments] fatal: ${err.message}\n`);
  process.exit(1);
});
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/pull-comments.ts
git commit -m "feat: add pull-comments orchestrator script"
```

---

## Task 13: Plugin manifest + 7 slash commands

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `commands/figma-feedback-help.md`
- Create: `commands/figma-feedback-init.md`
- Create: `commands/figma-feedback-capture.md`
- Create: `commands/figma-feedback-push.md`
- Create: `commands/figma-feedback-pull.md`
- Create: `commands/figma-feedback-plan.md`
- Create: `commands/figma-feedback-close-round.md`

Each command file is a short markdown doc with frontmatter. Its body tells Claude to invoke the skill at `skills/figma-feedback/SKILL.md` (created in Task 14) with the specific phase argument.

- [ ] **Step 1: Create `.claude-plugin/plugin.json`**

```json
{
  "name": "figma-feedback-plugin",
  "version": "0.1.0",
  "description": "Capture localhost prototypes into Figma for stakeholder review; ingest comments and propose change plans."
}
```

- [ ] **Step 2: Create `commands/figma-feedback-help.md`**

```markdown
---
description: List all figma-feedback-plugin commands with brief descriptions
---

Print the following to the user as the entire response. Do not call any tools. Do not invoke any skill.

# figma-feedback-plugin commands

**First time?** Run `/figma-feedback-init` in the repo where your dev server runs.

| Command | What it does |
|---|---|
| `/figma-feedback-help` | This list. |
| `/figma-feedback-init` | One-time setup. Verifies the Figma MCP is connected, writes `figma-feedback.config.json` and `.env.example`, initializes the round counter. |
| `/figma-feedback-capture [routes…]` | Runs Playwright over the configured routes (or just the ones you name) and saves PNGs into `feedback/round-N/captures/`. Then asks you to approve before pushing. |
| `/figma-feedback-push` | Uploads captured PNGs to Figma and asks the Figma MCP to create a `Round N` page with one frame per capture in a 3-column grid. Writes `push-manifest.json`. |
| `/figma-feedback-pull` | Pulls stakeholder comments from Figma for the current round's frames; writes `comments.json`. |
| `/figma-feedback-plan` | Clusters comments by inferred theme; writes `themes.md` and `plan.md` for you to review/edit. |
| `/figma-feedback-close-round` | Reads your `plan.md` + `addressed.md`, writes a per-round summary to the Figma `Changelog` page, and bumps the round counter. |

Workflow: `init` → `capture` → `push` → *(stakeholders comment)* → `pull` → `plan` → *(you implement changes)* → `close-round` → loop back to `capture`.

See the README at the plugin install location for setup details (Figma MCP install, Figma Personal Access Token, JSON Schema editor support).
```

- [ ] **Step 3: Create `commands/figma-feedback-init.md`**

```markdown
---
description: Set up figma-feedback in the current repo (config, env, round state)
---

Invoke the skill `figma-feedback` with phase `init`.
```

- [ ] **Step 4: Create `commands/figma-feedback-capture.md`**

```markdown
---
description: Capture screenshots of configured routes and preview the Figma layout
---

Invoke the skill `figma-feedback` with phase `capture`. Pass through any arguments the user provided (which may be a subset of route labels to capture).
```

- [ ] **Step 5: Create `commands/figma-feedback-push.md`**

```markdown
---
description: Upload captured PNGs to Figma and create the Round N page+frames via MCP
---

Invoke the skill `figma-feedback` with phase `push`.
```

- [ ] **Step 6: Create `commands/figma-feedback-pull.md`**

```markdown
---
description: Pull stakeholder comments from Figma for the current round
---

Invoke the skill `figma-feedback` with phase `pull`.
```

- [ ] **Step 7: Create `commands/figma-feedback-plan.md`**

```markdown
---
description: Cluster Figma comments by theme and write a proposed change plan
---

Invoke the skill `figma-feedback` with phase `plan`.
```

- [ ] **Step 8: Create `commands/figma-feedback-close-round.md`**

```markdown
---
description: Write a per-round summary to the Figma Changelog page and advance the round counter
---

Invoke the skill `figma-feedback` with phase `close-round`.
```

- [ ] **Step 9: Commit**

```bash
git add .claude-plugin/
git commit -m "feat: add plugin manifest and 7 slash commands"
```

---

## Task 14: `skills/figma-feedback/SKILL.md` — orchestration brain

This is the doc Claude reads to know how to handle each phase. It documents the exact MCP tool calls, the exact TS script invocations, and the exact files to write.

**Files:**
- Create: `skills/figma-feedback/SKILL.md`

- [ ] **Step 1: Create the skill file**

```markdown
---
name: figma-feedback
description: Orchestrate the figma-feedback-plugin workflow. Use when handling /figma-feedback-* commands. Coordinates TS helper scripts and the Figma MCP server to capture localhost prototypes, push them to Figma, pull stakeholder comments, propose a change plan, and write a per-round changelog.
---

# figma-feedback orchestration

You are handling a phase of the figma-feedback-plugin workflow. The slash command tells you which phase: `init`, `capture`, `push`, `pull`, `plan`, or `close-round`.

## Resolving the plugin directory

The user runs slash commands in a consuming repo, not in the plugin's repo. The skill needs to invoke the plugin's TS helper scripts. Resolve the plugin path like this:

1. Read `$FIGMA_FEEDBACK_PLUGIN_DIR` from the user's environment (or from the consuming repo's `.env`).
2. If unset and the phase is `init`, ask the user for it and write it into the new `.env` along with `FIGMA_TOKEN`.
3. If unset for any other phase, abort with: `"FIGMA_FEEDBACK_PLUGIN_DIR is not set. Add it to .env or your shell. See README."`

For the rest of this skill, when you see `<PLUGIN_DIR>` in commands, substitute the actual absolute path. Run TS scripts as: `cd <CONSUMING_REPO> && <PLUGIN_DIR>/node_modules/.bin/tsx <PLUGIN_DIR>/scripts/<name>.ts <args>`.

## Universal preflight (skip only for `capture`)

Before doing anything else for any phase except `capture`:

1. List your available MCP tools. Confirm a Figma MCP write tool is available (typically `use_figma` from the official `figma/mcp-server-guide` server, or `figma_execute` from `southleft/figma-console-mcp`).
2. If no Figma MCP write tool is connected, abort and tell the user:
   - That the Figma MCP server is required for this command.
   - To install the official Figma MCP server (remote mode) per https://github.com/figma/mcp-server-guide.
   - That the community alternative `southleft/figma-console-mcp` is documented in this plugin's README as a free option.
   - Do not proceed with any other steps.

This preflight runs in `init` too — it's how we know the user has set up the MCP before they invest time in the rest of setup.

## Phase: `init`

1. Run the MCP preflight above.
2. Determine `<PLUGIN_DIR>` (this skill's directory's parent's parent — `.../figma-feedback-plugin`). If the user hasn't already set `FIGMA_FEEDBACK_PLUGIN_DIR`, tell them the absolute path and ask them to confirm it. You'll write it into `.env` in step 8.
3. Ask the user for their Figma file URL (e.g., `https://www.figma.com/file/<KEY>/<NAME>`). Extract the file key (the path segment after `/file/`).
4. Ask the user for their dev server URL (default offer: `http://localhost:3000`).
5. Ask the user for the changelog page name (default offer: `Changelog`).
6. Ask the user for an initial list of routes (label + path pairs). Encourage at least 2 to start.
7. Write `figma-feedback.config.json` in the cwd with the structure from the plugin's `config.schema.json`. Example:
   ```json
   {
     "devServer": { "url": "<URL>", "waitFor": "networkidle" },
     "viewport": { "width": 1440, "height": 900 },
     "figma": { "fileKey": "<KEY>", "changelogPageName": "<NAME>" },
     "routes": [
       { "label": "<LABEL>", "path": "<PATH>" }
     ]
   }
   ```
8. Copy `<PLUGIN_DIR>/.env.example` to the consuming repo's `.env` (do NOT overwrite if it already exists — instead, tell the user to manually add any missing keys). Fill in `FIGMA_FEEDBACK_PLUGIN_DIR=<PLUGIN_DIR>` automatically. Tell the user to fill in `FIGMA_TOKEN` (link: https://www.figma.com/developers/api#access-tokens).
9. Initialize round state by running: `<PLUGIN_DIR>/node_modules/.bin/tsx <PLUGIN_DIR>/scripts/init-state.ts` from the consuming repo's cwd. Expected stdout: `{ "initialized": ".../feedback/.round-state.json", "currentRound": 1 }`.
10. Tell the user the next step is to fill in `.env`, then run `/figma-feedback-capture`.

## Phase: `capture`

1. Run `<PLUGIN_DIR>/node_modules/.bin/tsx <PLUGIN_DIR>/scripts/capture.ts` from the consuming repo's cwd. Capture stdout (JSON) and stderr (logs).
   - If the user passed route labels as arguments, tell them route filtering is not implemented in v1 and offer to capture all routes.
2. Parse the stdout JSON: `{ round, captures: [{label, path}], failed: [...] }`.
3. Present a preview gate to the user:
   ```
   Captured N routes for Round <round>:
     01-login.png        → Frame "01 - Login"
     02-dashboard.png    → Frame "02 - Dashboard"
     …
   Expected Figma layout on page "Round <round>":
     3 columns wide, rows added as needed.
   Approve push? (yes / re-capture / cancel)
   ```
4. If the user approves, instruct them to run `/figma-feedback-push`. Do not auto-run push.
5. If any captures failed, list them with their error messages so the user can fix and re-run.

## Phase: `push`

1. Run MCP preflight (above).
2. Run `<PLUGIN_DIR>/node_modules/.bin/tsx <PLUGIN_DIR>/scripts/upload-images.ts` from the consuming repo's cwd. Capture stdout JSON: `{ round, uploads: [{label, filename, imageHash}], failed: [...] }`.
3. If `uploads` is empty, abort and tell the user the upload script reported no uploads.
4. Read the consuming repo's `figma-feedback.config.json` to get `figma.fileKey` and `viewport.width`.
5. Call the Figma MCP to find or create the page named `Round <round>`. The exact tool call depends on which MCP is connected; for the official Figma MCP (`use_figma`), the operation is "find or create a page in file `<fileKey>` named `Round <round>`." Capture the returned page ID.
6. For each upload in `uploads` (order matters; preserve the order from the script's output):
   - Compute grid position with `col = i % 3` and `row = floor(i / 3)`. Frame dimensions: `viewport.width` × the actual PNG height (Figma will display the image at its native height when `scaleMode: 'FIT'`; for v1 use `'FILL'` per the spec).
   - Frame name: `<NN> - <label>` where NN is the 2-digit one-indexed position.
   - Frame x: `col * (viewport.width + 40)`. Frame y: `row * 1000` (provisional; final positioning is best-effort since we don't know image heights yet).
   - Call the Figma MCP to create a frame on the page with that name, size, and position, and set `fills` to `[{ type: 'IMAGE', imageHash: <hash>, scaleMode: 'FILL' }]`.
   - Capture the returned frame ID.
7. Write `feedback/round-<round>/push-manifest.json`:
   ```json
   {
     "round": <round>,
     "page_id": "<pageId>",
     "frames": [
       { "label": "<label>", "frame_id": "<frameId>", "image_hash": "<hash>" }
     ]
   }
   ```
8. Tell the user the Figma file URL and that they can share it with stakeholders.

## Phase: `pull`

1. Run MCP preflight.
2. Run `<PLUGIN_DIR>/node_modules/.bin/tsx <PLUGIN_DIR>/scripts/pull-comments.ts` from the consuming repo's cwd. Capture stdout JSON: `{ round, totalComments, forThisRound, wroteTo }`.
3. Tell the user `forThisRound` comments were saved to `wroteTo`.
4. If `forThisRound` is 0, tell the user no feedback exists yet for this round and suggest waiting before running `/figma-feedback-plan`.

## Phase: `plan`

1. Run MCP preflight.
2. Read `feedback/round-<round>/comments.json` (resolve `<round>` from `feedback/.round-state.json`).
3. If the file does not exist, tell the user to run `/figma-feedback-pull` first.
4. Cluster the comments by inferred semantic theme. Do not group by frame or by author — group by what the comment is *about* (e.g., "Navigation clarity", "Color contrast", "Onboarding flow"). One theme may span multiple frames.
5. Write `feedback/round-<round>/themes.md` with one section per theme:
   ```markdown
   ## Theme: <name>
   Comments: #<id> (<author>), #<id> (<author>), …
   Summary: <2-3 sentence description of what the theme captures>
   ```
6. Write `feedback/round-<round>/plan.md` with proposed changes grouped by the same themes:
   ```markdown
   ## Proposed changes

   ### Theme: <name>
   1. [ ] <Concrete change>
      Drives from: #<id>, #<id>
   2. [ ] <Concrete change>
      Drives from: #<id>
   ```
7. Tell the user to review and edit `plan.md`: uncheck items they reject, reorder, add notes. Tell them to track what they actually implemented in `feedback/round-<round>/addressed.md` (one bullet per change, in the format `- <change description>. Drove from: #<id>, #<id>`).

## Phase: `close-round`

1. Run MCP preflight.
2. Resolve current round from `feedback/.round-state.json`.
3. Read `feedback/round-<round>/plan.md` and `feedback/round-<round>/addressed.md`. If either is missing, abort and tell the user which one and why it's needed.
4. Compute the round summary by running the format-changelog CLI from the consuming repo's cwd:
   ```bash
   <PLUGIN_DIR>/node_modules/.bin/tsx <PLUGIN_DIR>/scripts/format-changelog.ts \
     <round> <round + 1> <YYYY-MM-DD> \
     feedback/round-<round>/plan.md \
     feedback/round-<round>/addressed.md
   ```
   Capture the markdown string from stdout.
5. Read the consuming repo's `figma-feedback.config.json` to get `figma.fileKey` and `figma.changelogPageName`.
6. Call the Figma MCP to find or create a page with name `<changelogPageName>` in the file. Capture the page ID.
7. Call the Figma MCP to enumerate existing frames on that page to determine the next frame's y-position (vertical stack below existing frames). If no existing frames, start at y=0.
8. Call the Figma MCP to create a text frame on that page:
   - Name: `Round <round> → Round <round + 1>`
   - Position: x=0, y=<computed>
   - Width: 800
   - Content: the markdown string from step 4 (rendered as plain text or RTF as the MCP supports; the official MCP's text creation accepts plain text by default).
9. Bump the round state by running a small inline tsx command from the consuming repo's cwd:
   ```bash
   <PLUGIN_DIR>/node_modules/.bin/tsx -e "import('<PLUGIN_DIR>/src/round-state.js').then(m => { const n = m.bumpRound('feedback/.round-state.json'); console.log('currentRound now', n); })"
   ```
10. Tell the user the round summary was written to the `Changelog` page and that the next `/figma-feedback-capture` will start Round `<round + 1>`.

## Error handling principles

- TS script exits with non-zero → relay the stderr verbatim to the user, do not retry automatically.
- MCP call fails → relay the MCP error verbatim, note any partial state (e.g., "images were uploaded but no frames were created — you can clean up the orphaned image hashes by deleting the Round <N> page if it was created").
- Never silently degrade. Never fall back to manual seed instructions. The spec deliberately removed that fallback.

## Notes for future you

- `<PLUGIN_DIR>` is the absolute path to where this plugin is installed (e.g., `~/.claude/plugins/figma-feedback-plugin`). The consuming repo (where the user runs the slash commands) has its own `figma-feedback.config.json`, `.env`, and `feedback/` directory.
- All TS scripts assume the cwd is the consuming repo, not the plugin directory.
- The Figma MCP's exact tool name and argument shape varies by server. The official Figma MCP exposes a single `use_figma` tool that accepts natural-language operations; the community `southleft/figma-console-mcp` exposes typed tools like `figma_execute` and `figma_create_child`. Adapt the calls in steps above to whatever shape your connected MCP expects.
```

- [ ] **Step 2: Commit**

```bash
git add skills/
git commit -m "feat: add figma-feedback skill with per-phase orchestration"
```

---

## Task 15: `README.md` — setup + smoke test

**Files:**
- Create: `README.md`

- [ ] **Step 1: Replace any placeholder README with the real one**

```markdown
# figma-feedback-plugin

A Claude Code plugin that captures localhost web prototypes, pushes them to Figma for stakeholder review, ingests Figma comments, clusters them by theme, and writes per-round changelogs.

## Requirements

- Node.js 20+
- Playwright Chromium (installed by `npm install` via `npx playwright install chromium`)
- A Figma account with edit access to the file you'll be pushing into
- **The official Figma MCP server connected to your Claude Code session** (`figma/mcp-server-guide`, remote mode). Setup: https://github.com/figma/mcp-server-guide
  - Community alternative (free, less battle-tested): `southleft/figma-console-mcp` — not officially supported by this plugin but the skill can be adapted by changing the MCP tool names in `skills/figma-feedback/SKILL.md`.
- A Figma Personal Access Token (for REST image uploads + comment reads, separate from MCP auth): https://www.figma.com/developers/api#access-tokens

## Install the plugin

(Plugin install mechanism depends on your Claude Code plugin distribution method. Reference the Claude Code plugin docs for current installation steps. After install, the slash commands listed below become available in any session.)

## First-time setup in a project

In the repository where your dev server runs:

1. Make sure the Figma MCP is connected to your Claude Code session.
2. Run `/figma-feedback-init`.
3. The init prompts will confirm the plugin's install path and ask for your Figma file URL, dev server URL, changelog page name, and an initial list of routes.
4. The init writes `.env` (or asks you to copy `.env.example`) with `FIGMA_TOKEN` and `FIGMA_FEEDBACK_PLUGIN_DIR`. Fill in `FIGMA_TOKEN` from https://www.figma.com/developers/api#access-tokens.
5. Verify by running `/figma-feedback-help` — it should list all commands.

### Why FIGMA_FEEDBACK_PLUGIN_DIR?

This plugin's TS helper scripts live in the plugin's install directory (e.g., `~/.claude/plugins/figma-feedback-plugin`), not in your project. The skill needs an absolute path to find them when you run a slash command from your project. Setting `FIGMA_FEEDBACK_PLUGIN_DIR` once per project (in `.env`) avoids guessing.

## The round workflow

| Step | Command | What you do |
|---|---|---|
| 1 | `/figma-feedback-capture` | Start your dev server, then run the command. Approve the preview when shown. |
| 2 | `/figma-feedback-push` | Pushes captures to Figma. Share the file URL with stakeholders. |
| 3 | *(wait)* | Stakeholders leave comments on Figma frames. |
| 4 | `/figma-feedback-pull` | Pulls those comments locally. |
| 5 | `/figma-feedback-plan` | Generates `themes.md` and `plan.md`. Review and edit `plan.md`. |
| 6 | *(implement)* | Use your normal Claude Code coding session. Track each addressed item in `feedback/round-N/addressed.md`. |
| 7 | `/figma-feedback-close-round` | Writes the per-round summary to Figma's Changelog page and bumps the round counter. |
| 8 | Back to step 1 for Round N+1 | |

## Files this plugin manages in your repo

- `figma-feedback.config.json` — your routes, viewport, Figma file key, changelog page name
- `.env` — your `FIGMA_TOKEN` (REST only; MCP auth is separate)
- `feedback/.round-state.json` — current round counter
- `feedback/round-N/` — per-round artifacts:
  - `captures/*.png` — screenshots
  - `push-manifest.json` — what was uploaded and which Figma frame IDs they became
  - `comments.json` — stakeholder comments for this round
  - `themes.md` — clustered themes (Claude-written)
  - `plan.md` — proposed changes (Claude-written, you edit)
  - `addressed.md` — what you actually implemented (you write)

## JSON Schema editor support

If your editor supports JSON Schema linting for `.json` files, add this to your `figma-feedback.config.json`:

```json
{
  "$schema": "/absolute/path/to/figma-feedback-plugin/config.schema.json",
  …
}
```

(Plugin installs are not in your repo's `node_modules`, so the path must be absolute.)

## Manual smoke test (run before every release)

This plugin's CI cannot verify the Figma MCP integration end-to-end. Before tagging a release, run the full smoke test against a throwaway Figma file:

1. Create a fresh Figma file you don't care about. Note the file URL.
2. In a temporary directory, create a minimal dev server (e.g., `npx http-server` serving two HTML pages at `/login` and `/dashboard`).
3. Run `/figma-feedback-init` and provide the throwaway file URL.
4. Run `/figma-feedback-capture` — verify both PNGs appear in `feedback/round-1/captures/`.
5. Run `/figma-feedback-push` — verify the Figma file now has a `Round 1` page with 2 frames, each filled with the captured image.
6. Add 2 comments in Figma on those frames.
7. Run `/figma-feedback-pull` — verify `feedback/round-1/comments.json` contains both comments.
8. Run `/figma-feedback-plan` — verify `themes.md` and `plan.md` are reasonable.
9. Edit `plan.md` to mark one item checked. Create `feedback/round-1/addressed.md` with a single bullet.
10. Run `/figma-feedback-close-round` — verify the Figma file has a `Changelog` page with a `Round 1 → Round 2` frame.
11. Verify `feedback/.round-state.json` shows `currentRound: 2`.

If any step fails, the corresponding phase in `skills/figma-feedback/SKILL.md` is the place to look.

## Limitations (v1)

- Local dev server only. Deployed-URL capture (Vercel/Netlify/Pages) deferred.
- Full-screen captures only. No component-level or state captures.
- Single Figma file per project.
- No fallback if the Figma MCP is unavailable — commands fail hard with setup instructions.
- Official Figma MCP's "Write to canvas" feature is currently beta-free; Figma has indicated it will become a paid feature in the future.

## Development

```bash
npm install
npm test           # run all unit + integration tests
npm run build      # type-check only
```

Tests use vitest. The Playwright integration test downloads Chromium on first install (`npx playwright install chromium`).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup, workflow, and manual smoke test"
```

---

## Task 16: End-to-end manual smoke test

**Files:** none (verification only)

This task is a real end-to-end run, not code. Treat it as the v1 acceptance test. Do **not** mark complete until all steps pass.

- [ ] **Step 1: Verify the plugin loads in Claude Code**

Install the plugin per your Claude Code plugin distribution mechanism. In a new Claude Code session, run `/figma-feedback-help`. Expected: command list is printed.

- [ ] **Step 2: Verify Figma MCP preflight rejects when missing**

Disconnect the Figma MCP from your Claude Code session. Run `/figma-feedback-init`. Expected: skill aborts with a setup message pointing at the Figma MCP install docs.

- [ ] **Step 3: Reconnect Figma MCP. Run full round.**

Follow the manual smoke test procedure in the README (all 11 steps). If any step fails, do not mark this task complete — file an issue documenting the failure and patch the relevant phase in `SKILL.md` or the relevant TS script, then re-run.

- [ ] **Step 4: Verify second round works**

After the first `/figma-feedback-close-round` succeeds, run `/figma-feedback-capture` again. Verify:
- The new captures land in `feedback/round-2/captures/`
- `/figma-feedback-push` creates a `Round 2` page (separate from `Round 1`)

- [ ] **Step 5: Tag v0.1.0 if all of the above passed**

```bash
git tag v0.1.0
```

- [ ] **Step 6: No commit required for this task (verification only).**
