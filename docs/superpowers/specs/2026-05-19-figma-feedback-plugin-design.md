# Figma Feedback Plugin — Design

**Date:** 2026-05-19
**Status:** Approved (sections 1–3), pending written-spec review

## Purpose

A Claude Code plugin that turns localhost web prototypes into a stakeholder-review loop in Figma. The plugin:

1. **Captures** PNG screenshots of routes in a local dev server.
2. **Pushes** them to Figma as labeled frames on a per-round page.
3. **Pulls** stakeholder comments left on those frames.
4. **Clusters** comments by inferred theme and proposes a change plan.
5. **Records** a per-round changelog entry in Figma citing which comments drove which changes.

The plugin handles capture, push, pull, clustering, and changelog writing. **It does not implement code changes** — implementation happens in the user's normal Claude Code coding sessions, with the plugin's `plan.md` as the worklist.

## Scope

### v1 (this spec)

- Local dev server (HTTP URL) as the only capture source
- Full-screen captures, one PNG per configured route
- One Figma file per project; pages named `Round N`; dedicated `Changelog` page
- Comments clustered by semantic theme
- Per-round batched changelog entries

### Explicitly out of scope (v1 YAGNI list)

- Component-level / partial-page capture
- UI state capture (hover, modal open, etc.)
- Deployed-URL capture (Vercel/Netlify/GitHub Pages) — deferred to v2
- Authenticated-route capture (no pre-capture hook yet)
- Figma frame creation via REST API (see [Risks](#risks))
- Multi-project / multi-Figma-file support
- Stakeholder-weighted comment ranking
- Auto-implementation of changes by the plugin

## Shape

Claude Code plugin combining:

- **Slash commands** (in `.claude-plugin/commands/`) as the user-facing entry points
- **A skill** (in `.claude-plugin/skills/figma-feedback/SKILL.md`) that Claude follows for the steps requiring judgment (capture preview, comment clustering, changelog formatting)
- **TypeScript helper scripts** (in `scripts/`) for everything that must be deterministic: Playwright capture, Figma REST calls, file I/O

Single language across the plugin: **Node + TypeScript**.

## Repo layout (the plugin itself)

```
figma-feedback-plugin/
├── .claude-plugin/
│   ├── plugin.json
│   ├── commands/
│   │   ├── figma-feedback-init.md
│   │   ├── figma-feedback-capture.md
│   │   ├── figma-feedback-push.md
│   │   ├── figma-feedback-pull.md
│   │   ├── figma-feedback-plan.md
│   │   └── figma-feedback-close-round.md
│   └── skills/
│       └── figma-feedback/SKILL.md
├── scripts/
│   ├── capture.ts            # Playwright capture
│   ├── push.ts               # Figma upload + frame placement
│   ├── pull-comments.ts      # Figma comments fetch + filter
│   └── write-changelog.ts    # Format + write changelog frame
├── src/
│   ├── figma-client.ts       # Thin wrapper over Figma REST
│   ├── config.ts             # Config loading + zod validation
│   └── round-state.ts        # Reads/writes feedback/.round-state.json
├── tests/
├── package.json
├── tsconfig.json
├── config.schema.json        # Published for consuming-repo JSON Schema linting
├── .env.example
└── README.md
```

## Consuming repo layout

In the user's app repo, only two artifacts are owned by this workflow:

```
<your-app-repo>/
├── figma-feedback.config.json
└── feedback/
    ├── .round-state.json
    └── round-N/
        ├── captures/             # PNGs
        ├── push-manifest.json    # What was uploaded; frame IDs by label
        ├── comments.json         # Raw Figma comments for this round
        ├── themes.md             # Clustered themes + citations (Claude-written)
        ├── plan.md               # Proposed changes (Claude-written, user-edited)
        └── addressed.md          # What user actually implemented
```

## Slash command flow (one full round)

| # | Command | Purpose |
|---|---|---|
| 1 | `/figma-feedback-init` | One-time. Writes `figma-feedback.config.json` and `.env.example`, prompts for Figma file URL and dev server URL. |
| 2 | `/figma-feedback-capture [routes…]` | Runs Playwright over config routes (or supplied subset). Saves PNGs to `feedback/round-N/captures/`. Skill shows the captured list + proposed Figma layout and asks for approval. |
| 3 | `/figma-feedback-push` | Uploads PNGs to Figma, places them as frames on the `Round N` page in a grid, writes `push-manifest.json`. |
| 4 | *(stakeholders comment in Figma)* | — |
| 5 | `/figma-feedback-pull` | Pulls comments anchored to Round N's page, saves `comments.json`. |
| 6 | `/figma-feedback-plan` | Claude clusters by theme, writes `themes.md` and `plan.md`. User reviews/edits `plan.md`. |
| 7 | *(user implements in normal Claude Code coding session; updates `addressed.md`)* | — |
| 8 | `/figma-feedback-close-round` | Reads `plan.md` + `addressed.md`, writes round summary to the `Changelog` page, bumps round counter. |

## Phase 1 data flow — capture → preview → push

```
figma-feedback.config.json
        │
        ▼
  /figma-feedback-capture
        │
        ├── Playwright launches headless Chromium
        ├── For each route: goto → wait (networkidle or selector) → screenshot
        ├── Saves PNGs → feedback/round-N/captures/<NN>-<label>.png
        ▼
  Skill (Claude) presents preview gate:
    "Captured 5 routes for Round 2:
       01-login.png        → Frame '01 - Login'
       02-dashboard.png    → Frame '02 - Dashboard'
       …
     Expected Figma layout on page 'Round 2':
       3 columns wide, rows added as needed (here: 2 rows).
     Approve push? (yes / edit list / re-capture)"
        │ (user approval)
        ▼
  /figma-feedback-push
        │
        ├── POST images via Figma image upload endpoint
        ├── Look up the 'Round N' page in the Figma file
        │   └─ If missing: print a seed checklist for the user
        │      ("Create page 'Round N' with N empty frames named
        │        '01 - Login', '02 - Dashboard', … then re-run")
        │      and exit. See Risks for why this manual step exists.
        ├── For each captured PNG, find the matching empty frame by name
        │   and replace its fill with the uploaded image hash
        ├── Write feedback/round-N/push-manifest.json
        │   { round, page_id, frames: [{label, frame_id, image_hash}] }
        ▼
   User shares the Figma file URL with stakeholders.
```

## Phase 2 data flow — pull → cluster → plan → implement → changelog

```
  (stakeholders leave comments in Figma)
        │
        ▼
  /figma-feedback-pull
        │
        ├── GET /v1/files/<key>/comments
        ├── Filter to comments anchored to Round N's frames (via push-manifest node IDs)
        ├── Save feedback/round-N/comments.json
        │   [{id, frame_label, author, message, created_at, resolved}, …]
        ▼
  /figma-feedback-plan
        │
        ├── Claude reads comments.json
        ├── Clusters by inferred semantic theme
        ├── Writes themes.md:
        │     ## Theme: Navigation clarity
        │     Comments: #12 (Sarah), #17 (Mike), #23 (Sarah)
        │     Summary: stakeholders struggled to find …
        ├── Writes plan.md:
        │     ## Proposed changes
        │     1. [ ] Add breadcrumbs to Dashboard
        │        Drives from: #12, #17
        │     2. [ ] …
        ▼
  (user reviews/edits plan.md — uncheck rejected items, reorder, add notes)
        │
        ▼
  (user implements in normal Claude Code session;
   appends to addressed.md as work completes:
   "- Added breadcrumbs to Dashboard. Drove from: #12, #17")
        │
        ▼
  /figma-feedback-close-round
        │
        ├── Reads plan.md + addressed.md
        ├── Formats markdown summary:
        │     ## Round 2 → Round 3 changes
        │     ### Theme: Navigation clarity
        │     - Added breadcrumbs to Dashboard
        │       Drove from: Sarah (#12), Mike (#17)
        │     - …
        ├── Writes summary to a new frame on the 'Changelog' page
        ├── Bumps feedback/.round-state.json currentRound → N+1
        ▼
   Next /figma-feedback-capture starts Round N+1.
```

## Configuration

### `figma-feedback.config.json` (consuming repo)

```json
{
  "devServer": {
    "url": "http://localhost:3000",
    "waitFor": "networkidle"
  },
  "viewport": { "width": 1440, "height": 900 },
  "figma": {
    "fileKey": "abc123...",
    "changelogPageName": "Changelog"
  },
  "routes": [
    { "label": "Login",     "path": "/login" },
    { "label": "Dashboard", "path": "/dashboard", "waitFor": "[data-loaded]" }
  ]
}
```

- Validated with **zod** on load; missing/wrong-shape fields produce an error citing the exact field path.
- `fileKey` is extracted from the user's Figma file URL during `/figma-feedback-init`.
- The plugin ships `config.schema.json` for users who want editor JSON-Schema linting; they can add `"$schema": "<absolute path or URL>"` themselves. Not added by default because the plugin install path isn't predictable from the consuming repo.

### Secrets — `.env` (consuming repo, gitignored)

```
FIGMA_TOKEN=figd_xxxxx
```

- `.env.example` is scaffolded by `/figma-feedback-init`.
- The init command explains in chat how to generate a Figma Personal Access Token and links to Figma's docs.
- Loaded via `dotenv` at script start; missing token fails loudly with a one-line error and a docs link.

### Round state

`feedback/.round-state.json` — `{ "currentRound": 2 }`. Created by `/figma-feedback-init` with `currentRound: 1`. Bumped only by `/figma-feedback-close-round`. Every other command reads it to know which `round-N/` directory to use.

## Error handling

Validate at boundaries, trust internal code:

| Boundary | Failure mode | Handling |
|---|---|---|
| Config load | Missing / malformed | zod error → exit 1 with field path |
| Playwright capture | Route 404, JS error, timeout | Skip route, log clearly, continue. Final summary: N succeeded / M failed. No batch abort. |
| Figma API push | 4xx (bad token, no permission) | Abort, print Figma's error message verbatim, point at PAT setup |
| Figma API push | 5xx / rate limit | Exponential-backoff retry (3 attempts), then abort with a partial-state warning |
| Comments pull | No comments yet | Empty `comments.json`; skill tells user "no feedback yet, nothing to plan" |
| Changelog write | `Changelog` page missing | Print seed checklist ("create page 'Changelog' in your Figma file, then re-run") and exit without writing |

No try/catch around code that cannot fail internally. No fallbacks for impossible states.

## Testing

- **Unit:** `src/figma-client.ts` and `src/config.ts` with mocked `fetch` and fixture configs. **vitest.**
- **Integration (capture):** Spin up a tiny static HTTP server with 2 fixture HTML pages. Run capture against it. Assert PNG files exist with expected dimensions.
- **Figma client fixtures:** Recorded real-API responses, replayed via mocked `fetch`. A `scripts/refresh-fixtures.ts` regenerates them when the API contract shifts. **No live Figma in CI.**
- **Manual smoke test:** Documented procedure in README — run a full round against a throwaway Figma file before any release tag.
- **TDD** for the helper modules (config, figma-client, comment filtering, changelog formatting). The Playwright capture script is built iteratively against the fixture HTTP server.

## Risks

### Figma page/frame creation via REST API

Figma's REST API supports **uploading images by hash** and **replacing image fills on existing frames**, but does **not** support creating **pages or frames** in arbitrary files without either:

- (a) Running inside a Figma desktop plugin (uses the Figma Plugin API, not REST), or
- (b) Holding paid **Dev Mode REST API** access.

**v1 user experience (agreed):** before each round's `/figma-feedback-push`, the user manually creates a new page in Figma named `Round N` and adds one empty frame per intended capture, naming each frame after the route label (e.g. `01 - Login`, `02 - Dashboard`). On push:

- `push.ts` looks up the `Round N` page by name and matches each PNG to a frame by name.
- For each match, it uploads the PNG and updates the frame's image fill via the API.
- If the page is missing or any frame is missing, the script prints a precise seed checklist and exits without modifying Figma.

The push-manifest records the resolved frame IDs so later steps (comment pulling, changelog) don't need to re-resolve by name.

This manual seed step per round is the largest UX friction in v1. Two v2 paths to eliminate it:

- Ship a small companion Figma desktop plugin that does the seeding when invoked by the user from inside Figma, OR
- Adopt the paid Dev Mode REST API.

Both deferred to v2.

## Open questions

None blocking v1 implementation. The frame-creation risk above is acknowledged with an agreed fallback.
