---
description: List all figma-feedback-plugin commands with brief descriptions
---

Print the following to the user as the entire response. Do not call any tools. Do not invoke any skill.

# figma-feedback-plugin commands

**First time?** Run `/figma-feedback-plugin:init` in the repo where your dev server runs.

| Command | What it does |
|---|---|
| `/figma-feedback-plugin:help` | This list. |
| `/figma-feedback-plugin:init` | One-time setup. Verifies the Figma MCP is connected, writes `figma-feedback.config.json` and `.env.example`, initializes the round counter. |
| `/figma-feedback-plugin:capture [routes…]` | Runs Playwright over the configured routes (or just the ones you name) and saves PNGs into `feedback/round-N/captures/`. Then asks you to approve before pushing. |
| `/figma-feedback-plugin:push` | Uploads captured PNGs to Figma and asks the Figma MCP to create a `Round N` page with one frame per capture in a 3-column grid. Writes `push-manifest.json`. |
| `/figma-feedback-plugin:pull` | Pulls stakeholder comments from Figma for the current round's frames; writes `comments.json`. |
| `/figma-feedback-plugin:plan` | Clusters comments by inferred theme; writes `themes.md` and `plan.md` for you to review/edit. |
| `/figma-feedback-plugin:close-round` | Reads your `plan.md` + `addressed.md`, writes a per-round summary to the Figma `Changelog` page, and bumps the round counter. |

Workflow: `init` → `capture` → `push` → *(stakeholders comment)* → `pull` → `plan` → *(you implement changes)* → `close-round` → loop back to `capture`.

See the README at the plugin install location for setup details (Figma MCP install, Figma Personal Access Token, JSON Schema editor support).
