<p align="center">
  <img src="./assets/logo.svg" alt="figloops" width="700"/>
</p>

<p align="center">
  Wizard-driven user feedback loops for web prototypes — built as a Claude Code plugin.
</p>

Capture your routes into Figma, ingest the comments users leave, get a per-round change plan, ship the changes, and write a per-round changelog back into Figma — all from one slash command.

---

## Requirements

Before installing, make sure you have:

1. **Claude Code** installed.
2. **Node.js 20+**.
3. **A Figma account** with edit access to a file you can push into. *(Recommended: a fresh file dedicated to this project.)*
4. **A Figma Personal Access Token** — generate at https://www.figma.com/developers/api#access-tokens.
5. **The official Figma MCP server connected to your Claude Code session** — setup: https://github.com/figma/mcp-server-guide *(remote mode)*.

If any of these are missing, `/figloops:init` will refuse to complete and tell you what to fix.

---

## Install

In Claude Code, run these **one at a time**:

```
/plugin marketplace add tyburrowbridge/figloops
```

```
/plugin install figloops@figloops
```

```
/reload-plugins
```

To pin to a specific release instead of tracking the default branch: `tyburrowbridge/figloops@v1.0.0`.

---

## Use it (3 steps)

In the repo where your dev server runs:

1. **`/figloops:init`** — answers a few questions, validates everything, writes config + `.env` + state files.
2. **Start your dev server** (e.g., `npm run dev`).
3. **`/figloops:next`** — run this whenever you're ready to advance. It runs everything it can autonomously and stops only when it needs your input.

That's the whole loop. Re-run `/figloops:next` after each gate until the round closes.

---

## Commands

You'll mostly only use `:next`.

| Command | What it does |
|---|---|
| `/figloops:init` | One-time project setup wizard. |
| `/figloops:next` | Workhorse — runs the current phase, stops at the next gate. |
| `/figloops:status` | Read-only view of the round tracker. |
| `/figloops:feedback` | Show all user feedback to date, grouped by round and frame. |
| `/figloops:themes` | Show all clustered themes to date, grouped by round. |
| `/figloops:reset` | Restart the current round or discard all rounds and start fresh. |
| `/figloops:help` | Lists commands and shows where you are. |

---

## What happens in a round

`/figloops:next` walks 9 phases. You only have to act at the 5 gates.

| # | Phase | Gate |
|---|---|---|
| 1 | Capture screenshots | Approve · Re-capture · Cancel |
| 2 | Push to Figma | — |
| 3 | Wait for user comments | re-run `:next` when ready |
| 4 | Pull comments | — |
| 5 | Review comments | Continue · Pull again · Cancel |
| 6 | Cluster themes | — |
| 7 | Approve plan | Approve all · Approve some · Edit one · Reject all |
| 8 | Implement changes | Mark items shipped · Close round |
| 9 | Close round | — |

---

## Files figloops puts in your repo

- `figloops.config.json` — routes, viewport, Figma file key
- `.env` — `FIGMA_TOKEN` + `FIGLOOPS_PLUGIN_DIR`
- `feedback/state.json` — source of truth for all round data
- `feedback/round-N/captures/*.png` — screenshots
- `feedback/round-N/snapshot.md` — auto-generated audit of the round. **Don't edit — it's regenerated on every `:next`.**

---

## Known limits (v1.0.0)

- Full-screen captures only (no component-level)
- One Figma file per project
- Requires Figma MCP — no REST-only fallback

---

## For contributors

```bash
npm install
npm test       # 58 unit + integration tests
npm run build  # type-check only
```

Before tagging a release, run the **manual smoke test** end-to-end against a throwaway Figma file (the MCP integration can't be tested in CI). The full procedure walks: init → capture → push → comment → pull → review → cluster → approve → implement → close, asserting state and Figma side-effects at each step.

Architecture and detailed phase prose: `docs/superpowers/specs/2026-05-20-figloops-v1-design.md` and `skills/figloops/SKILL.md`.
