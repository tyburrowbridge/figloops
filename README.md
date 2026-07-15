<p align="center">
  <img src="./assets/logo.svg" alt="figloops" width="700"/>
</p>

<p align="center">
  A Claude Code plugin that bridges the gap between live code and design-led user feedback. Automatically <strong>snapshot URLs into Figma frames</strong>, <strong>ingest user comments</strong>, <strong>analyze UX themes</strong>, and <strong>generate actionable UI updates and release notes</strong> — all structured by iteration rounds.
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

- [ ] **Claude Code** (any version)
- [ ] **Node.js 20+** — [nodejs.org](https://nodejs.org)
- [ ] **Figma account** with edit access — *(recommended: a dedicated file, figloops creates pages on every round)*
- [ ] **Figma Personal Access Token** — [generate one](https://www.figma.com/developers/api#access-tokens)
- [ ] **Figma MCP server** connected — [setup guide](https://github.com/figma/mcp-server-guide) *(remote mode)*

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
| 3 | `/figloops:go` | Runs the current phase autonomously, stops at the next gate. |

Repeat step 3 after each gate until the round closes.

---

## Commands

You'll mostly only use `:next`.

| Command | What it does |
|---|---|
| `/figloops:init` | One-time project setup wizard. |
| `/figloops:go` | Workhorse — runs the current phase, stops at the next gate. |
| `/figloops:status` | Round tracker + Figma connection health check (PAT + MCP). |
| `/figloops:feedback` | Show all user feedback to date, grouped by round and frame. |
| `/figloops:themes` | Show all clustered themes to date, grouped by round. |
| `/figloops:summary` | One-table rollup of every round (status, phase, counts, completion date). |
| `/figloops:restart` | Restart the current round or discard all rounds and start fresh. |
| `/figloops:uninstall` | Remove all local figloops files (state, config, `.env` keys). Figma file untouched. |
| `/figloops:whatsnew` | Release notes + check if a newer version is available on GitHub. |
| `/figloops:help` | Lists commands and shows where you are. |

---

## What happens in a round

`/figloops:go` walks 8 phases. You only have to act at the 4 gates (3 in terminal, 1 in Figma).

| # | Phase | Gate |
|---|---|---|
| 1 | Capture screenshots | Approve · Re-capture · Cancel |
| 2 | Push to Figma | — |
| 3 | Wait for user comments | re-run `:next` when ready |
| 4 | Pull comments | — |
| 5 | Review comments | Continue · Pull again · Cancel |
| 6 | Cluster themes | — |
| 7 | Ack plan in Figma | Resolve threads or reply `/skip` in Figma; re-run `:next` to advance |
| 8 | Close round | — |

---

## Project files

- `figloops.config.json` — routes, viewport, Figma file key
- `.env` — `FIGMA_TOKEN` + `FIGLOOPS_PLUGIN_DIR`
- `feedback/.auth/storageState.json` — saved browser session for auth-gated pages (**gitignore this — it holds live cookies**)
- `feedback/state.json` — source of truth for all round data
- `feedback/round-N/captures/*.png` — screenshots
- `feedback/round-N/snapshot.md` — auto-generated audit of the round. **Don't edit — it's regenerated on every `:next`.**

---

## Auth-gated pages (SSO / SAML / login)

If capture screenshots show a sign-in page instead of the real UI, the target is behind auth. Playwright captures in a fresh browser with no session cookies — VPN alone isn't enough.

1. Add an `auth` block to `figloops.config.json`:
   ```json
   "auth": { "storageState": "feedback/.auth/storageState.json" }
   ```
2. Gitignore that path (it holds live session cookies):
   ```
   feedback/.auth/
   ```
3. Run the login helper — a headed browser opens; sign in until you see the real page, then press Enter:
   ```bash
   "$FIGLOOPS_PLUGIN_DIR/node_modules/.bin/tsx" "$FIGLOOPS_PLUGIN_DIR/scripts/auth-login.ts"
   ```

Capture and scenario discovery reuse the saved session. Re-run the helper when captures start hitting sign-in pages again (session expired).

---

## Upgrading

Upgrades go through Claude Code's plugin manager:

```
/plugin update figloops
/reload-plugins
```

After upgrading, run `/figloops:whatsnew` to see what changed and confirm you're on the latest release.

---

## Uninstall

Wipe all local figloops files (state, config, `.env` keys). Your Figma file, pages, and comments are left alone.

```
/figloops:uninstall
```

Then remove the plugin itself from Claude Code:

```
/plugin uninstall figloops@figloops
/plugin marketplace remove figloops
```

**Manual fallback** (if the command is unavailable):

```bash
rm -rf feedback figloops.config.json figloops.config.*.json.bak
# then edit .env to remove the FIGMA_TOKEN and FIGLOOPS_PLUGIN_DIR lines
```

To start fresh without uninstalling, re-run `/figloops:init` — it offers a **Purge** option when existing state is detected.

---

## Known limits (v1.0.0)

- Full-screen captures only (no component-level)
- One Figma file per project
- Requires Figma MCP — no REST-only fallback

---

## For contributors

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, test commands, and the manual smoke test procedure.

Architecture and detailed phase prose: `docs/superpowers/specs/2026-05-20-figloops-v1-design.md` and `skills/figloops/SKILL.md`.
