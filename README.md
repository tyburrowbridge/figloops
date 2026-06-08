<p align="center">
  <img src="./assets/logo.svg" alt="figloops" width="700"/>
</p>

<p align="center">
  A Claude Code plugin that bridges the gap between live code and design-led user feedback. Automatically snapshot your project's URLs into organized Figma frames, ingest user comments, analyze UX themes, and generate actionable UI updates and release notes—all structured by iteration rounds.
</p>


---

## Features

| | |
|---|---|
| **Automated Figma snapshots** | Captures every route (local or deployed) and arranges them into labeled Figma frames ready for review. |
| **AI comment synthesis** | Pulls feedback from Figma, clusters it into UX themes, filters noise. |
| **Prioritized change plan** | Converts themes into a concrete, ranked list of UI changes for Claude Code to implement. |
| **Structured rounds** | Feedback, plan, and changelog are scoped per round — easy to trace what changed and why. |
| **Auto-generated changelog** | Writes a user-facing changelog page back into your Figma file after each round closes. |

---

## Requirements

| | |
|---|---|
| Claude Code | Any version |
| Node.js | 20+ |
| Figma account | Edit access to a file *(recommended: a dedicated file — figloops creates pages on every round)* |
| Figma Personal Access Token | [Generate one](https://www.figma.com/developers/api#access-tokens) |
| Figma MCP server | [Setup guide](https://github.com/figma/mcp-server-guide) *(remote mode)* |

`/figloops:init` validates all of these and tells you what's missing.

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

## Use it

| Step | Command | What it does |
|---|---|---|
| 1 | `/figloops:init` | One-time setup — validates credentials, collects routes, writes config. |
| 2 | *(start your app)* | Local (`npm run dev`) or any deployed URL. |
| 3 | `/figloops:next` | Runs the current phase autonomously, stops at the next gate. |

Repeat step 3 after each gate until the round closes.

---

## Commands

You'll mostly only use `:next`.

| Command | What it does |
|---|---|
| `/figloops:init` | One-time project setup wizard. |
| `/figloops:next` | Workhorse — runs the current phase, stops at the next gate. |
| `/figloops:status` | Round tracker + Figma connection health check (PAT + MCP). |
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

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, test commands, and the manual smoke test procedure.

Architecture and detailed phase prose: `docs/superpowers/specs/2026-05-20-figloops-v1-design.md` and `skills/figloops/SKILL.md`.
