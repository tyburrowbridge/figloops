# Changelog

## v1.4.6 — 2026-06-09

### Features
- Comment review now renders a **single** table with columns `# | 🖼️ Frame | 👤 User | 💬 Comment | 🔗 Link`. The Link column deep-links each row to the comment in Figma (`https://www.figma.com/design/<fileKey>/?node-id=<nodeId>#<commentId>`) so reviewers can jump straight to the thread

### Internal
- `Comment` schema gains optional `nodeId` field (preserved from Figma REST response); `pull-comments.ts` populates it

## v1.4.5 — 2026-06-09

### Fixes
- Canvas background detection: `sampleLuminance` now walks DOM ancestors until an opaque background is found (falls back to body/html). Previously, transparent center elements returned `rgba(0,0,0,0)` and falsely cached `uiTheme: 'dark'`, causing the push page background to render light (`#F0F0F0`) instead of dark (`#1E1E1E`)
- Hardened `figloops-next-push` skill: `pageBg`/`labelClr` resolved outside embedded JS as inline literals (no ternary in the substituted script), `page.backgrounds` force-overwritten, and `appliedBg` returned + verified before uploads to catch silent bg-set failures

## v1.4.4 — 2026-06-09

### Polish
- `/figloops:whatsnew` rendered in a scannable stripe layout — version + date header bar, two-space indent, category icons (✨ features, ⚡ perf, 🔧 fixes, 🎨 polish, ⚠️ breaking, 🔒 security) per item, hanging-indent wrap

## v1.4.3 — 2026-06-09

### Polish
- Updated plugin description in `plugin.json` + `marketplace.json` to match README tagline

## v1.4.2 — 2026-06-09

### Polish
- Hide all internal skills from `/` slash-command picker via `user-invocable: false` frontmatter. Picker now shows only user-facing commands (`/figloops:init`, `:next`, `:status`, `:feedback`, `:themes`, `:summary`, `:restart`, `:whatsnew`, `:help`). Internal phase skills remain fully invokable via the Skill tool.

## v1.4.0 — 2026-06-09

### Features
- `/figloops:whatsnew` — pull-only release notes viewer; shows installed version, latest CHANGELOG entries, and checks GitHub raw `plugin.json` to recommend `/plugin update figloops` when a newer version exists
- `/figloops:help` now renders the installed version on both initialized and not-initialized screens

## v1.3.0 — 2026-06-09

### Features
- `/figloops:summary` — one-table rollup of every round (status, phase, ASCII progress bar against the 9-phase pipeline, captures, comments, themes, plan, completion date in `MMM DD YYYY` format)

## v1.2.1 — 2026-06-09

### Breaking
- Renamed `/figloops:reset` → `/figloops:restart` (skill `figloops-reset` → `figloops-restart`)

## v1.2.0 — 2026-06-09

### Features
- CLI progress bars during capture and route probing (TTY: live `[████░░] 3/8` bar; non-TTY: one line per completion)
- Per-upload progress lines during push (`[push] ✓ filename`)

## v1.1.0 — 2026-06-09

### Performance
- Parallel curl uploads in push phase (was serial; saves 30-60s/round at 5-10 captures)
- JPEG quality 85 screenshots replace PNG (~60% smaller, faster uploads)
- Parallel Playwright contexts during capture (pool of 4)
- SHA-256 image hash dedup: re-pushes skip unchanged frames
- Cached `uiTheme` skips luminance sampling on re-captures
- Dropped redundant snapshot regeneration after capture and review phases

### Notes
- Capture filenames now end in `.jpg` instead of `.png`. Push pipeline auto-detects extension and content type.

## v1.0.0 — 2026-06-08

Initial public release.

### Features
- `/figloops:init` — wizard-driven one-time setup: validates Figma MCP, PAT, and file access; auto-discovers routes from Next.js, Nuxt, SvelteKit, and React Router projects; optional scenario capture (modals, dark mode, etc.)
- `/figloops:next` — single workhorse command that walks all 9 phases, stops at gates requiring human input
- `/figloops:status` — round tracker with live Figma connection health check (PAT + MCP)
- `/figloops:feedback` — all user comments grouped by round and frame
- `/figloops:themes` — all clustered themes grouped by round
- Phase pipeline: capture → push to Figma → await comments → pull → review → cluster → approve plan → implement → close
- Git branch-per-round support (`always` / `ask` / `never`)
- Auto-generated `feedback/round-N/snapshot.md` audit log per round
- Changelog page written back into Figma on round close
