# Changelog

## v1.6.0 — 2026-06-24

### Changed
- **`/figloops:next` renamed to `/figloops:go`.** ⚠️ Breaking — the old command no longer exists. The 8 phase skills are renamed `figloops-next-*` → `figloops-go-*` to match. All in-tool prompts and docs updated.

### Added
- **`/figloops:discover`** — crawls the running app in a browser, clicks candidate triggers, and auto-detects modals, slide-over panels/drawers, dropdown menus/popovers, and tabs/accordions, emitting ready-to-use scenarios (stable trigger selector + `waitFor` on the revealed overlay). Presents candidates in a table to pick from; picked scenarios are merged into `figloops.config.json`. Also offered during `/figloops:init` (step 7e) as "Auto-detect" alongside manual entry. New scripts: `discover-scenarios.ts`, `merge-scenarios.ts`; shared `src/playwright-helpers.ts`. Scenario schema gains an optional `kind` (`modal`/`panel`/`menu`/`tab`).
- Capture now waits for entrance animations/transitions to finish before screenshotting (`document.getAnimations()` settle, capped at 2s). Infinite/looping animations (spinners) are ignored so they don't stall the shot — no more mid-animation captures.

### Fixed
- Push frame labels now clear Figma's frame-name strip (added vertical gap) — the title above each frame no longer overlaps the gray frame name.
- Push no longer advances on a silent commit failure: `upload-to-urls.ts` reports `commitFailed` and exits non-zero when an uploaded blob fails to finalize (was logged to stderr only, while the phase advanced with blank frames).
- Capture sweeps the full page height before settling so scroll/intersection reveal animations fire and finish before the screenshot — previously `getAnimations()` only saw already-started animations and the fullPage scroll triggered reveals mid-shot. Finite animations with a null effect no longer burn the full 2s settle cap.
- `hash-captures.ts` skips a file that vanishes/locks mid-run instead of aborting and losing every hash.

### Internal
- Push/restart phases route through tsx scripts instead of ad-hoc shell (`shasum`, `curl`, `date`, `cut`, `rm -rf`) — covered by the existing allowlisted tsx pattern, eliminating per-round permission prompts. New scripts: `hash-captures.ts`, `upload-to-urls.ts`, `timestamp.ts`, `reset-round.ts`. `emptyRound()` exported from `src/state.ts`.
- `upload-to-urls.ts` uses a bounded worker pool (peak memory ≈ concurrency × largest file, not the sum of all captures) and derives Content-Type from the file extension itself, removing the MIME-mapping step from the push skill markdown.

## v1.5.0 — 2026-06-10

### Changed
- **Plan + Implement phases collapsed into Plan-Ack.** Plan approval and implementation tracking now happen on a rendered Figma plan frame. Resolve a comment thread to mark an item shipped; reply `/skip` to drop it.
- State schema bumped from v1 → v2. Auto-migrates on first load. New plan statuses: `pending`, `shipped`, `wontdo`, `removed` (replacing `proposed`/`approved`/`rejected`/`dropped`).
- Round phase count: 9 → 8. Gate count: 5 → 4.

### Added
- Figma REST helpers: `postComment`, `postReply`, `deleteComment`.
- `figloops-next-plan-ack` skill (render + refresh modes).
- `/figloops:uninstall` command + `figloops-uninstall` skill + `scripts/uninstall.ts`. Hard-deletes `feedback/`, `figloops.config.json`, all `figloops.config.*.json.bak`, and strips `FIGMA_TOKEN`/`FIGLOOPS_PLUGIN_DIR` from `.env` (deletes `.env` if empty after). Figma file, pages, and comments left untouched. `--dry-run` flag supported.
- `/figloops:init` Step 2a: new **Purge** option on existing-state prompt; invokes the uninstall script then continues init from Step 3.

### Removed
- `figloops-next-plan` and `figloops-next-implement` skills.

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
