# Changelog

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
