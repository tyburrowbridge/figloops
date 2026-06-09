# Changelog

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
