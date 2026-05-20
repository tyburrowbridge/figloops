# figloops

A Claude Code plugin for stakeholder feedback loops on localhost prototypes. Captures your routes into Figma, ingests the comments stakeholders leave, proposes a per-round change plan, tracks what you actually ship, and writes a per-round changelog frame back into Figma.

The plugin is wizard-driven: four commands total, and one of them (`/figloops:next`) drives the entire round forward through nine phases with native task-tracker visibility.

## Requirements

- Node.js 20+
- Playwright Chromium (installed automatically by `npm install` via `npx playwright install chromium`)
- A Figma account with edit access to the file you'll be pushing into
- **The official Figma MCP server connected to your Claude Code session** (`figma/mcp-server-guide`, remote mode). Setup: https://github.com/figma/mcp-server-guide
  - Community alternative (free, less battle-tested): `southleft/figma-console-mcp` — not officially supported but the skill can be adapted by changing the MCP tool names in `skills/figloops/SKILL.md`.
- A Figma Personal Access Token (for REST image uploads + comment reads, separate from MCP auth): https://www.figma.com/developers/api#access-tokens

## Install the plugin

Plugin install depends on your Claude Code plugin distribution mechanism. After install, the four slash commands below are available in any session.

## First-time setup in a project

In the repository where your dev server runs:

1. Make sure the Figma MCP is connected to your Claude Code session.
2. Run `/figloops:init`.
3. The wizard verifies your MCP connection, validates your Figma PAT against `GET /v1/me`, validates the file URL against `GET /v1/files/<key>`, then writes `figloops.config.json`, `.env`, and `feedback/state.json`. It refuses to complete until every check passes.
4. Verify by running `/figloops:help` — should show "Round 1 · phase: capture".

## Commands

| Command | What it does |
|---|---|
| `/figloops:init` | One-time project setup wizard. Verifies MCP, Figma PAT, and Figma file access. |
| `/figloops:next` | Workhorse. Reads state, runs the current phase autonomously, stops at the next user gate. |
| `/figloops:status` | Read-only view of the current round tracker. |
| `/figloops:help` | Lists commands and shows "you are here" if a round is in progress. |

## The round workflow

Each round goes through 9 phases. `/figloops:next` runs them, stopping at four interactive gates plus one passive gate.

| # | Phase | Gate |
|---|---|---|
| 1 | Capture screenshots | **Gate 1:** approve / recapture / cancel |
| 2 | Push to Figma | — |
| 3 | Wait for stakeholder comments | **Gate 2 (passive):** re-run `:next` when ready |
| 4 | Pull comments | — |
| 5 | Review comments | **Gate 3:** continue / pull-again / cancel |
| 6 | Cluster themes | — |
| 7 | Approve plan | **Gate 4:** approve all / approve N,M / edit N: ... / reject all |
| 8 | Implement changes | **Gate 5:** done N / done N,M / close |
| 9 | Close round | — |

## Files this plugin manages in your repo

- `figloops.config.json` — routes, viewport, Figma file key, changelog page name
- `.env` — `FIGMA_TOKEN` + `FIGLOOPS_PLUGIN_DIR`
- `feedback/state.json` — **source of truth** for all round data
- `feedback/round-N/` — per-round artifacts:
  - `captures/*.png` — screenshots
  - `snapshot.md` — human-readable audit of the round, auto-generated from `state.json`. **Edits will be overwritten on the next `/figloops:next`.**

## Manual smoke test (run before every release)

The MCP integration cannot be tested in CI. Before tagging a release, run the full smoke test against a throwaway Figma file:

1. Create a fresh Figma file you don't care about. Note the file URL.
2. In a temporary directory, create a minimal dev server (e.g., `npx http-server` serving two HTML pages at `/login` and `/dashboard`).
3. Run `/figloops:init`:
   - Verify the wizard refuses if MCP is not connected (test by disconnecting MCP and re-running).
   - Verify the wizard refuses on a bad PAT.
   - Verify the wizard refuses on a file URL you don't have access to.
4. Re-run `/figloops:init` cleanly, providing valid inputs.
5. Run `/figloops:next` — verify capture phase runs, presents preview, gates on approval.
6. Approve. Verify push phase runs, MCP creates the Round 1 page with two frames, frames have image fills, `state.json` contains `pushManifest`.
7. Re-run `/figloops:next` — verify await-comments stays in phase with "no comments yet".
8. Add 2 comments in Figma.
9. Run `/figloops:next` — verify pull writes comments into `state.json` with `authorName` populated, then comment-review gate displays comments grouped by frame.
10. Reply `continue` — verify cluster phase runs, themes appear in `state.json`, plan-approval gate displays numbered items.
11. Reply `approve 1` — verify only item 1 is approved (item 2 is rejected), advance to implement.
12. Reply `done 1` — verify item 1 marked shipped, auto-advance to close.
13. Verify Figma file now has a `Changelog` page with a `Round 1 → Round 2` text frame.
14. Verify `state.json` shows `currentRound: 2`, `currentPhase: capture`.
15. Verify `feedback/round-1/snapshot.md` was regenerated at every step and contains author names.

If any step fails, the matching phase in `skills/figloops/SKILL.md` is the place to look.

## Limitations (v1.0.0)

- Local dev server only. Deployed-URL capture deferred.
- Full-screen captures only. No component- or state-level captures.
- Single Figma file per project.
- No fallback if the Figma MCP is unavailable — commands fail hard with setup instructions.
- Official Figma MCP's "Write to canvas" feature is currently beta-free; Figma has indicated it will become a paid feature.

## Development

```bash
npm install
npm test           # all unit + integration tests
npm run build      # type-check only
```

Tests use vitest. Playwright integration test downloads Chromium on first install.
