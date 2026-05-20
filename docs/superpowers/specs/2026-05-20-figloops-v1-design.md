# figloops — Design

**Date:** 2026-05-20
**Status:** Implemented in v1.0.0

## Purpose

`figloops` is a Claude Code plugin that turns localhost web prototypes into a stakeholder-review loop in Figma. The plugin captures screenshots of configured routes, pushes them to a Figma file as labeled frames, ingests the comments stakeholders leave, proposes a per-round change plan, tracks what gets shipped, and writes a per-round changelog entry back into Figma.

The user experience is wizard-driven: one command (`/figloops:next`) advances the entire round through nine phases autonomously, gating only where genuine human judgment is needed.

## Scope

### In scope

- **Wizard-driven workflow**: four commands total (`init`, `next`, `status`, `help`)
- **Forced init verification**: every input validated against a live external check before init completes
- **JSON state of record**: `feedback/state.json` is the canonical store; `feedback/round-N/snapshot.md` is auto-generated audit output
- **Native task tracker progress**: the skill drives `TaskCreate` / `TaskUpdate` so Claude Code renders the round phase list automatically
- **Author names in citations**: every comment reference uses the Figma user's display name first, numeric ID in parens
- **State-aware help**: `:help` shows "you are here" if a round is in progress, otherwise points at `:init`

### Out of scope

- Deployed-URL capture (Vercel/Netlify/GitHub Pages)
- Authenticated-route capture
- Component- or state-level capture
- Multiple Figma files per project
- Stakeholder-weighted comment ranking
- Plugin-driven implementation of changes
- REST-only fallback when the Figma MCP is unavailable
- Official support for community Figma MCPs
- Command escape hatches like `:back` or `:redo-capture` — delete artifacts and re-run if needed
- Background polling for new Figma comments — user invokes `:next` when they think feedback has arrived
- Multi-user state ownership — `state.json` assumes one developer drives the round

## Key decisions

| # | Decision | Why |
|---|---|---|
| 1 | JSON state is source of truth; `.md` is a generated snapshot | In-product checklist UX, plus grep/diff/PR-review-friendly audit. Best of both. |
| 2 | Init verifies MCP probe, PAT (`GET /v1/me`), and file access (`GET /v1/files/<key>`) | Catches the three real failure modes at the moment the user is focused on setup, not three commands later. |
| 3 | Wizard-only model with `:next` as the driver | "As little input as is reasonable." Removes "what command was next?" cognitive load. |
| 4 | Native task tracker (`TaskCreate`/`TaskUpdate`) for visual progress | Matches Claude Code's standard tracker visual. Zero rendering code on our side. |
| 5 | `feedback/state.json` at repo root (not hidden under `.figloops/`) | Sits alongside the existing `feedback/round-N/` artifacts; visible to the user. |
| 6 | "Suggest a fresh Figma file" is a passive tip, not a blocking prompt | Removing unnecessary friction at init. |
| 7 | Comment-review gate between pull and cluster | Lets the user spot-check raw comments before Claude clusters them. |
| 8 | `reject all` at plan-approval routes to round close with an empty changelog note | Preserves the audit trail without forcing implementation. |

## Command surface

Four commands total. Each has one clear purpose.

| Command | What it does |
|---|---|
| `/figloops:init` | One-time setup wizard. Verifies MCP, validates Figma PAT and file URL, writes `figloops.config.json` and `.env`, initializes `feedback/state.json`. Refuses to complete until every external check passes. |
| `/figloops:next` | The workhorse. Reads `state.json`, runs the current phase autonomously, advances state, prints the native task tracker. Stops at the next user gate. |
| `/figloops:status` | Read-only view of the round tracker. For "where am I?" without commitment. |
| `/figloops:help` | State-aware command list. Shows "you are here" when a round is in progress; leads with `:init` when no config exists. |

## State model

### `feedback/state.json` (source of truth)

```json
{
  "schemaVersion": 1,
  "currentRound": 2,
  "currentPhase": "await-comments",
  "rounds": {
    "1": {
      "completedAt": "2026-05-12T14:22:00Z",
      "captures": [
        { "label": "Login", "path": "/login", "filename": "01-login.png" }
      ],
      "pushManifest": {
        "pageId": "12:33",
        "frames": [
          { "label": "Login", "frameId": "12:34", "imageHash": "abc...123" }
        ]
      },
      "comments": [
        {
          "id": "12",
          "frameLabel": "Login",
          "authorName": "Sarah Lee",
          "authorHandle": "@sarah",
          "message": "The CTA below the form is hard to find.",
          "createdAt": "2026-05-14T10:11:00Z",
          "resolved": false
        }
      ],
      "themes": [
        {
          "name": "Navigation clarity",
          "commentIds": ["12", "17"],
          "summary": "Stakeholders struggled to orient inside the app."
        }
      ],
      "plan": [
        {
          "id": "p1",
          "themeName": "Navigation clarity",
          "change": "Add breadcrumbs to Dashboard",
          "drivesFrom": ["12", "17"],
          "status": "shipped"
        }
      ]
    },
    "2": {
      "captures": [],
      "pushManifest": null,
      "comments": [],
      "themes": [],
      "plan": []
    }
  }
}
```

### Phase enum

`capture | push | await-comments | pull | comment-review | cluster | plan-approval | implement | close`

### Plan item statuses

`proposed | approved | rejected | shipped | dropped`

(`dropped` is used when `close` is invoked while items still have `approved` status.)

### `feedback/round-N/snapshot.md` (generated)

Single file per round, regenerated whenever state changes. Top-of-file header makes its derived nature explicit:

```
> Generated by figloops. Edits will be overwritten on the next /figloops:next.
> Source of truth: feedback/state.json
```

Sections: Captures, Comments (with author names), Themes, Plan (with `[✓]` / `[ ]` per item). The plugin never reads `snapshot.md` — it exists for git diff, PR review, and grep.

### Config / environment

- **`figloops.config.json`** (consuming repo) — routes, viewport, Figma file key, changelog page name. Schema in `config.schema.json`.
- **`.env`** (consuming repo) — `FIGMA_TOKEN` for REST calls, `FIGLOOPS_PLUGIN_DIR` so the skill can locate its TS helper scripts.

## Init wizard sequence

Linear. Refuses to advance until each check passes. Each failure prints the exact reason plus a setup link or remediation tip.

1. **MCP preflight.** List available MCP tools. If `use_figma` (or equivalent write tool) is missing, print install instructions for `figma/mcp-server-guide` and abort. If present, run a no-op probe call (e.g., "get current selection" or "get file metadata") to confirm auth works end-to-end.

2. **Suggest a fresh Figma file** (passive tip, not blocking):

   > Recommended — create a fresh Figma file for this project before continuing. You'll get a clean slate per project and avoid polluting an existing design file.

3. **Figma PAT.** Prompt for token. Call `GET /v1/me`. If 401, refuse with the PAT setup link.

4. **Figma file URL.** Prompt. Parse out file key (accept `figma.com/file/`, `figma.com/design/`, `figma.com/proto/` URLs). Call `GET /v1/files/<key>`. If 403/404, refuse with the exact reason ("you do not have edit access" vs "file does not exist").

5. **Project config.** Dev server URL (default `http://localhost:3000`), viewport (default 1440×900), changelog page name (default `Changelog`), starter routes (require at least 1 label+path pair).

6. **Write artifacts.**
   - `figloops.config.json` in cwd
   - `.env` in cwd with `FIGMA_TOKEN`, `FIGLOOPS_PLUGIN_DIR` (do not overwrite if exists; print delta instructions)
   - `feedback/state.json` initialized at `currentRound: 1`, `currentPhase: capture`

7. **Print "ready" summary.** Calls `TaskCreate` to seed the 9 phases of Round 1, all pending. User sees the native task tracker rendered and is told to run `/figloops:next` to start.

## Round flow

`/figloops:next` is a state machine. Each invocation runs everything it can autonomously and stops at the next gate. **Four interactive gates plus one passive gate per round.**

### Visible tasks (rendered by Claude Code's native tracker)

The skill calls `TaskCreate` at round start for nine tasks, then `TaskUpdate` to mark each `in_progress` / `completed` as it advances:

1. Capture screenshots
2. Push to Figma
3. Wait for stakeholder comments
4. Pull comments
5. Review comments
6. Cluster themes
7. Approve plan
8. Implement changes
9. Close round

### Per-phase behavior

| # | Phase | What `:next` does | Gate |
|---|---|---|---|
| 1 | `capture` | Runs Playwright over configured routes. Prints captured list + planned 3-col Figma layout. | **Gate 1:** `approve` / `recapture` / `cancel` |
| 2 | `push` | MCP preflight → REST image upload → MCP create page + frames + image fills → write `pushManifest` into `state.json`. Prints the Figma file URL. | none — advances on success |
| 3 | `await-comments` | Calls the pull script. If 0 comments: prints "No comments yet — re-run `/figloops:next` when stakeholders respond." Stays in phase. | **Gate 2 (passive):** user re-runs `:next` when ready |
| 4 | `pull` | (Same script as phase 3, just succeeded.) Filters comments to this round's frame IDs, resolves author names, writes into `state.json`. Auto-advances to `comment-review`. | none |
| 5 | `comment-review` | Renders pulled comments grouped by frame, each cited as `Author Name (#id)`. | **Gate 3:** `continue` to cluster, or `pull-again` to re-fetch (e.g., more comments arrived) |
| 6 | `cluster` | Claude clusters comments by inferred semantic theme. Writes `themes` into `state.json`. Auto-advances to `plan-approval`. | none |
| 7 | `plan-approval` | Renders proposed plan as numbered items grouped by theme. | **Gate 4:** approval syntax (see below) |
| 8 | `implement` | Renders approved items with status. User implements in their normal Claude Code session and marks shipped. | **Gate 5:** implement syntax (see below) |
| 9 | `close` | Formats changelog markdown from shipped items → MCP writes text frame to Changelog page → regenerates final `snapshot.md` → bumps `currentRound`, resets `currentPhase` to `capture`. | none |

Note: Gate 2 is a *passive* gate — the user simply re-runs `:next` to retry the pull. Gates 1, 3, 4, 5 require an interactive reply.

Phases 3 and 4 (`await-comments` and `pull`) are one logical step from the user's perspective: a single `:next` invocation transitions from `await-comments` through `pull` and parks at `comment-review` (gate 3). The two phases are modeled separately so the task tracker can show "Wait for stakeholder comments" as a distinct visible step even when it ticks through quickly.

### Gate 3 — comment-review reply syntax

```
Reply with one of:
  continue           (advance to clustering)
  pull-again         (re-fetch comments from Figma, e.g. more arrived)
  cancel             (abort the round; state reverts to await-comments)
```

`continue` advances to `cluster`. `pull-again` re-runs the pull script in place and re-renders the comment list. `cancel` is the escape hatch if the user realizes the round needs more time before clustering.

### Gate 4 — plan approval reply syntax

```
Reply with one of:
  approve all
  approve 1,3        (and implicitly reject 2)
  edit 2: <new wording>   (re-prompt for approval after edit)
  reject all         (close round with empty changelog note)
```

Skill parses the reply, updates each plan item's `status`, regenerates `snapshot.md`, and advances to `implement`. `reject all` skips `implement` and goes straight to `close`; the changelog frame contains `Round N → N+1: feedback not actionable this round.`

### Gate 5 — implement reply syntax

```
Reply with one of:
  done 2             (mark item 2 shipped)
  done 2,3           (mark multiple shipped)
  close              (close round; remaining approved items become 'dropped')
```

When every approved item is `shipped` — or the user replies `close` — auto-advances to `close` phase.

## Author-name treatment

Figma's `GET /v1/files/<key>/comments` response already includes the commenter's display name in `user.handle`. The plugin surfaces this everywhere a comment is cited:

- `state.json` stores `authorName` and `authorHandle` per comment
- `snapshot.md` cites as `Sarah Lee (#12)` — name first, ID in parens
- In-chat `comment-review` and `plan-approval` outputs use the same format
- The changelog text frame written to Figma during `close` cites the same way

The numeric ID is preserved alongside the name so users can cross-reference comments in the Figma UI (which exposes IDs).

## `/figloops:help` output

State-aware. Two variants:

### When `feedback/state.json` exists (mid-project)

Header surfaces current round and phase with a "next action" hint:

```
figloops
Stakeholder feedback loops for localhost prototypes.

  CURRENT
  Round 2 · phase: awaiting comments
  → Run /figloops:next when stakeholders respond

COMMANDS
  :next     Advance the round to the next phase or gate
  :status   Show round tracker without advancing
  :init     One-time project setup
  :help     This screen
```

### When no `state.json` (fresh project)

Header surfaces "not initialized" with init as the obvious next step:

```
figloops
Stakeholder feedback loops for localhost prototypes.

  NOT INITIALIZED
  No figloops.config.json in this project.
  → Run /figloops:init to set up

COMMANDS
  :init     One-time project setup wizard
  :next     Advance the round (after init)
  :status   Show round tracker
  :help     This screen

Requires: Figma MCP connected, Figma PAT
```

`:help` calls no tools beyond what's needed to read `state.json`. No MCP preflight, no network.

## Repo layout (the plugin itself)

```
figloops/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── commands/
│   ├── help.md
│   ├── init.md
│   ├── next.md
│   └── status.md
├── skills/
│   └── figloops/SKILL.md
├── scripts/
│   ├── capture.ts            # Playwright capture; writes captures into state.json
│   ├── upload-images.ts      # Uploads PNGs via Figma REST; returns image hashes
│   ├── set-manifest.ts       # Persists pushManifest into state.json
│   ├── pull-comments.ts      # Fetches + filters comments; writes into state.json
│   ├── format-changelog.ts   # Renders shipped plan items as changelog markdown
│   ├── render-snapshot.ts    # Regenerates feedback/round-N/snapshot.md from state
│   ├── advance-phase.ts      # State-machine transition CLI
│   ├── update-plan.ts        # Plan item set / status mutation CLI
│   └── set-themes.ts         # Persists themes array into state.json
├── src/
│   ├── figma-client.ts       # Figma REST wrapper (uploads, comments, validators)
│   ├── config.ts             # Zod schema + loader for figloops.config.json
│   └── state.ts              # Zod schema + reader/writer for feedback/state.json
├── tests/
├── package.json
├── tsconfig.json
├── config.schema.json
├── .env.example
└── README.md
```

## Consuming repo layout

```
<your-app-repo>/
├── figloops.config.json
├── .env
└── feedback/
    ├── state.json                   # source of truth
    └── round-N/
        ├── captures/                # PNGs
        └── snapshot.md              # auto-generated, never edited
```

## Error handling

Validate at boundaries, trust internal code, no silent degradation.

| Boundary | Failure | Handling |
|---|---|---|
| Init: MCP preflight | `use_figma` tool unavailable or probe fails | Abort init with MCP install link |
| Init: PAT validation | `GET /v1/me` returns 401 | Abort init with PAT setup link |
| Init: File URL validation | `GET /v1/files/<key>` returns 403/404 | Abort init with exact reason |
| `:next` in any phase | MCP call fails mid-phase | Surface MCP error verbatim, note any partial state, leave `currentPhase` unchanged so user can retry |
| `:next` capture | Route 404, JS error, timeout | Skip route, log, continue; print final N succeeded / M failed |
| `:next` push | REST upload 5xx / rate limit | Exponential-backoff retry (3 attempts), then abort phase |
| `:next` plan approval | Unparseable user reply | Re-prompt with the exact syntax; do not advance |
| State file: corrupted JSON | zod validation fails on load | Abort with "feedback/state.json is malformed; backup and re-run /figloops:init if you want to start fresh" |

The `:next` state machine is idempotent within a phase — re-running after a failure picks up where it left off, except where the failure was during an MCP write that may have left partial Figma state (in which case the skill says so).

## Testing

TS scripts are unit-testable with vitest:

- `src/state.ts` — full unit coverage for the JSON state operations (load, validate, write, ensureRound)
- `src/config.ts` — zod schema validation tests
- `src/figma-client.ts` — mocked fetch with recorded fixtures (uploads, comments, validators)
- `scripts/render-snapshot.ts` — snapshot tests over fixture `state.json` content
- `scripts/format-changelog.ts` — snapshot tests over fixture `RoundData`
- `scripts/advance-phase.ts`, `update-plan.ts`, `set-manifest.ts`, `set-themes.ts` — CLI behavior tests via `execSync` + temp dirs
- `scripts/capture.ts` — Playwright integration test against a fixture HTTP server

Skill + MCP behavior cannot be unit-tested. The manual smoke test in the README walks through the wizard end-to-end:

1. Fresh Figma file
2. `/figloops:init` — verify all three external checks pass and refuse failures
3. `/figloops:next` through all nine phases
4. Add comments mid-round
5. Approve a subset of plan items
6. Mark some shipped, leave others, `close` early
7. Verify Changelog frame, `state.json` shape, `snapshot.md` content, round counter bump

## Risks

- **MCP dependency**: every phase except `capture` requires the Figma MCP. No fallback. If MCP is not connected, every command except `:help` fails at the preflight step with a setup message.
- **Official Figma MCP "Write to canvas" may become paid**: README documents the community alternative as a fallback users can adapt manually by editing the skill's MCP tool calls.
- **Skill drift**: the skill prescribes exact MCP tool names and argument shapes. If a future Claude model interprets the skill loosely and improvises different MCP calls, results become non-deterministic. The manual smoke test catches drift.
- **State file corruption**: a bad `state.json` parse takes down every command except `:help`. Zod-validate on load with clear error tells the user how to recover.
- **`snapshot.md` user expectation gap**: users may edit `snapshot.md` expecting their edits to stick. Header warning makes the file's derived nature explicit, and the file is overwritten on every `:next`.
- **`TaskCreate` interference with non-figloops tasks**: if the user has other tasks in their Claude Code session, figloops phase tasks mix with them in the tracker. Mitigation: prefix all figloops task subjects with `[figloops]` so they're visually grouped.
