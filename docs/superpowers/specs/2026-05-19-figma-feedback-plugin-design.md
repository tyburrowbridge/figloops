# Figma Feedback Plugin — Design

**Date:** 2026-05-19
**Status:** Sections 1–3 approved; pivoted to MCP-first Figma writes; pending written-spec review

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
- **Requires:** the official **Figma MCP server** (`figma/mcp-server-guide`, remote mode) connected to the user's Claude Code session. The MCP performs all Figma write operations (page creation, frame creation, image fills, changelog text frames). REST is used only for image uploads and comment reads.

### Explicitly out of scope (v1 YAGNI list)

- Component-level / partial-page capture
- UI state capture (hover, modal open, etc.)
- Deployed-URL capture (Vercel/Netlify/GitHub Pages) — deferred to v2
- Authenticated-route capture (no pre-capture hook yet)
- Multi-project / multi-Figma-file support
- Stakeholder-weighted comment ranking
- Auto-implementation of changes by the plugin
- Support for community Figma MCPs (e.g., `southleft/figma-console-mcp`) — documented as an alternative in README but not officially tested
- REST-only fallback for Figma writes — if the MCP is not connected, the plugin fails hard with setup instructions rather than degrading

## Shape

Claude Code plugin combining:

- **Slash commands** (in `commands/`) as the user-facing entry points
- **A skill** (in `skills/figma-feedback/SKILL.md`) that Claude follows for the steps requiring judgment (capture preview, comment clustering, changelog formatting) **and to orchestrate Figma MCP calls** (page/frame creation, image fills, changelog text frames)
- **TypeScript helper scripts** (in `scripts/`) for everything that must be deterministic: Playwright capture, Figma REST calls (image uploads, comment reads), file I/O

Single language across the plugin: **Node + TypeScript**.

### Division of responsibility: TS vs. MCP

| Concern | Handled by | Why |
|---|---|---|
| Playwright capture | TS script | Determinism, no MCP equivalent |
| Image byte upload (`PUT /v1/images`) | TS script (Figma REST) | Determinism, REST handles this well |
| Comment fetch (`GET /v1/files/:key/comments`) | TS script (Figma REST) | Determinism |
| File I/O (configs, manifests, markdown) | TS script | Determinism |
| **Page creation** | Skill → MCP | REST cannot do this |
| **Frame creation + sizing + image fill** | Skill → MCP | REST cannot do this |
| **Changelog page creation + text frame writing** | Skill → MCP | REST cannot do this |
| Orchestration (capture → upload → MCP create → write manifest) | Skill (Claude) | Sequences TS and MCP calls |

The skill is the only place that mixes TS and MCP — TS scripts never call MCP directly (they can't), and MCP never reads project files (the skill passes any needed info into MCP tool calls).

## Repo layout (the plugin itself)

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
├── scripts/
│   ├── capture.ts            # Playwright capture
│   ├── upload-images.ts      # Upload PNGs via Figma REST, return image hashes
│   ├── pull-comments.ts      # Figma comments fetch + filter
│   └── format-changelog.ts   # Read plan.md + addressed.md, return formatted markdown
├── src/
│   ├── figma-client.ts       # Thin wrapper over Figma REST (uploads + comments)
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

## Slash command flow

### Discovery

`/figma-feedback-help` — Lists every plugin command with a one-line description and points at the README for setup. **Local-only, no MCP, no auth required.** Output is plain markdown rendered in the Claude Code session. This is the entry point for a new user who just installed the plugin and has no idea where to start.

The command's output mirrors the per-round table below, plus a short "First time? Run `/figma-feedback-init`" preamble.

### Per-round flow

Every command in the round flow (except `/figma-feedback-capture`, which is local-only) starts with a **MCP preflight** in the skill: Claude verifies the Figma MCP server is connected by listing available MCP tools. If the `use_figma` tool (or equivalent write tool) is missing, the skill instructs Claude to abort with a setup message pointing at the Figma MCP install docs. No silent degradation.

| # | Command | Purpose |
|---|---|---|
| 1 | `/figma-feedback-init` | One-time. Verifies MCP is connected, then writes `figma-feedback.config.json` and `.env.example`, prompts for Figma file URL and dev server URL, initializes `feedback/.round-state.json`. |
| 2 | `/figma-feedback-capture [routes…]` | Runs Playwright over config routes (or supplied subset). Saves PNGs to `feedback/round-N/captures/`. Skill shows the captured list + proposed Figma layout and asks for approval. |
| 3 | `/figma-feedback-push` | Uploads PNG bytes via REST, then Claude calls MCP to create the `Round N` page if missing, create one frame per capture in a 3-column grid, set each frame's image fill to the uploaded hash. Skill writes `push-manifest.json`. |
| 4 | *(stakeholders comment in Figma)* | — |
| 5 | `/figma-feedback-pull` | Pulls comments anchored to Round N's frames (via REST), saves `comments.json`. |
| 6 | `/figma-feedback-plan` | Claude clusters by theme, writes `themes.md` and `plan.md`. User reviews/edits `plan.md`. |
| 7 | *(user implements in normal Claude Code coding session; updates `addressed.md`)* | — |
| 8 | `/figma-feedback-close-round` | Reads `plan.md` + `addressed.md`, formats round summary markdown, Claude calls MCP to create the `Changelog` page if missing and add a new text frame with the summary. Bumps round counter. |

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
        ├── Skill MCP preflight (abort if Figma MCP not connected)
        ├── TS: scripts/upload-images.ts
        │     POST each PNG via Figma REST → returns image hashes
        ├── Claude → MCP: find or create page named 'Round N'
        ├── For each capture (in order):
        │     Claude → MCP: create a frame on that page
        │       - name: "01 - Login" (etc.)
        │       - size: viewport width × captured PNG height
        │       - position: 3-column grid: col = i % 3, row = floor(i / 3)
        │         (x = col × (frame_width + gap), y = row × (frame_height + gap))
        │       - fills: [{ type: 'IMAGE', imageHash: <hash>, scaleMode: 'FILL' }]
        │     Capture the returned frame ID
        ├── TS: write feedback/round-N/push-manifest.json
        │     { round, page_id, frames: [{label, frame_id, image_hash}] }
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
        ├── Skill MCP preflight (abort if Figma MCP not connected)
        ├── TS: scripts/format-changelog.ts
        │     Reads plan.md + addressed.md, returns formatted markdown:
        │     ## Round 2 → Round 3 changes
        │     ### Theme: Navigation clarity
        │     - Added breadcrumbs to Dashboard
        │       Drove from: Sarah (#12), Mike (#17)
        │     - …
        ├── Claude → MCP: find or create page named 'Changelog' (per config.figma.changelogPageName)
        ├── Claude → MCP: create a text frame on that page
        │     - title: "Round N → Round N+1 (YYYY-MM-DD)"
        │     - body: the formatted markdown above
        │     - positioned below any existing changelog frames (vertical stack)
        ├── TS: bump feedback/.round-state.json currentRound → N+1
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
- **Only consumed by TS scripts** (REST image upload, REST comment fetch). The Figma MCP server has its own authentication, configured at the Claude Code MCP-setup level (not via `.env`). The init command's setup instructions cover both: `.env` for REST + linking the user to Figma MCP setup docs for MCP auth.

### Round state

`feedback/.round-state.json` — `{ "currentRound": 2 }`. Created by `/figma-feedback-init` with `currentRound: 1`. Bumped only by `/figma-feedback-close-round`. Every other command reads it to know which `round-N/` directory to use.

## Error handling

Validate at boundaries, trust internal code:

| Boundary | Failure mode | Handling |
|---|---|---|
| Config load | Missing / malformed | zod error → exit 1 with field path |
| MCP preflight | Figma MCP not connected (`use_figma` tool unavailable) | Skill aborts with setup message: how to install the official Figma MCP (remote mode), link to docs, note about community alternative |
| MCP call | MCP tool error (auth, file permission, malformed request) | Skill surfaces the MCP error verbatim and aborts the command. Partial state (e.g. images uploaded but no frames created) noted in chat so the user can decide whether to retry or clean up |
| Playwright capture | Route 404, JS error, timeout | Skip route, log clearly, continue. Final summary: N succeeded / M failed. No batch abort. |
| Figma REST image upload | 4xx (bad token, no permission) | Abort, print Figma's error message verbatim, point at PAT setup |
| Figma REST image upload | 5xx / rate limit | Exponential-backoff retry (3 attempts), then abort |
| Comments pull | No comments yet | Empty `comments.json`; skill tells user "no feedback yet, nothing to plan" |

No try/catch around code that cannot fail internally. No fallbacks for impossible states.

## Testing

**TS scripts (the parts we can test in isolation):**

- **Unit:** `src/figma-client.ts` (REST wrapper) and `src/config.ts` with mocked `fetch` and fixture configs. **vitest.**
- **Integration (capture):** Spin up a tiny static HTTP server with 2 fixture HTML pages. Run capture against it. Assert PNG files exist with expected dimensions.
- **Figma REST fixtures:** Recorded real-API responses for image uploads and comment fetches, replayed via mocked `fetch`. A `scripts/refresh-fixtures.ts` regenerates them when the API contract shifts. **No live Figma REST in CI.**
- **`format-changelog.ts`:** Pure function over `plan.md` + `addressed.md` fixtures. Snapshot tests.
- **TDD** for `figma-client`, `config`, `round-state`, comment filtering, and changelog formatting.

**Skill + MCP (the parts we cannot unit-test):**

Claude's MCP orchestration cannot be reliably mocked in TS. We rely on:

- **Manual smoke test:** Documented procedure in README — run a full round (capture → push → comment → pull → plan → close-round) against a throwaway Figma file before any release tag. This is the only reliable verification that the MCP integration works end-to-end.
- **Skill clarity:** the skill prescribes exact MCP tool calls with exact argument shapes so Claude's behavior is as deterministic as possible. Drift in the skill is itself a bug.
- **CI cannot verify MCP behavior.** Documented as a known limitation; the manual smoke checklist is the gate.

## Risks

### MCP dependency

v1 requires the official Figma MCP server (`figma/mcp-server-guide`, remote mode) to be installed and connected to the user's Claude Code session. If it is not connected, every command except `/figma-feedback-capture` will fail at the preflight step with a setup message — no silent degradation, no REST-only fallback path.

This is a deliberate trade-off. Adding a REST-only fallback would mean maintaining two parallel push/changelog code paths and reintroducing the manual-seed friction we explicitly want to eliminate. The cost is hard coupling to the MCP being functional.

### Official Figma MCP "Write to canvas" becoming paid

The MCP's write feature is currently free during a beta period but Figma has stated it *"will become a usage-based paid feature in the future"* ([source](https://github.com/figma/mcp-server-guide/blob/main/README.md)). No price or date announced.

Mitigation: the README documents the community alternative `southleft/figma-console-mcp`, which exposes a functionally similar Plugin API surface (`figma_execute`, `figma_create_child`) under an MIT license. We don't officially support it in v1, but switching the skill's MCP tool calls is the only code change needed.

### Skill drift

The skill prescribes exact MCP tool names and argument shapes. If a future Claude model interprets the skill loosely and improvises different MCP calls, results become non-deterministic. Mitigation: the skill is explicit ("call `use_figma` with arguments X, Y, Z"), the manual smoke test catches drift, and the skill is versioned with the plugin.

## Open questions

None blocking v1 implementation. The MCP dependency is acknowledged and accepted.
