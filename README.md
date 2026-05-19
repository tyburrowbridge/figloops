# figma-feedback-plugin

A Claude Code plugin that captures localhost web prototypes, pushes them to Figma for stakeholder review, ingests Figma comments, clusters them by theme, and writes per-round changelogs.

## Requirements

- Node.js 20+
- Playwright Chromium (installed by `npm install` via `npx playwright install chromium`)
- A Figma account with edit access to the file you'll be pushing into
- **The official Figma MCP server connected to your Claude Code session** (`figma/mcp-server-guide`, remote mode). Setup: https://github.com/figma/mcp-server-guide
  - Community alternative (free, less battle-tested): `southleft/figma-console-mcp` — not officially supported by this plugin but the skill can be adapted by changing the MCP tool names in `.claude-plugin/skills/figma-feedback/SKILL.md`.
- A Figma Personal Access Token (for REST image uploads + comment reads, separate from MCP auth): https://www.figma.com/developers/api#access-tokens

## Install the plugin

(Plugin install mechanism depends on your Claude Code plugin distribution method. Reference the Claude Code plugin docs for current installation steps. After install, the slash commands listed below become available in any session.)

## First-time setup in a project

In the repository where your dev server runs:

1. Make sure the Figma MCP is connected to your Claude Code session.
2. Run `/figma-feedback-plugin:init`.
3. The init prompts will confirm the plugin's install path and ask for your Figma file URL, dev server URL, changelog page name, and an initial list of routes.
4. The init writes `.env` (or asks you to copy `.env.example`) with `FIGMA_TOKEN` and `FIGMA_FEEDBACK_PLUGIN_DIR`. Fill in `FIGMA_TOKEN` from https://www.figma.com/developers/api#access-tokens.
5. Verify by running `/figma-feedback-plugin:help` — it should list all commands.

### Why FIGMA_FEEDBACK_PLUGIN_DIR?

This plugin's TS helper scripts live in the plugin's install directory (e.g., `~/.claude/plugins/figma-feedback-plugin`), not in your project. The skill needs an absolute path to find them when you run a slash command from your project. Setting `FIGMA_FEEDBACK_PLUGIN_DIR` once per project (in `.env`) avoids guessing.

## The round workflow

| Step | Command | What you do |
|---|---|---|
| 1 | `/figma-feedback-plugin:capture` | Start your dev server, then run the command. Approve the preview when shown. |
| 2 | `/figma-feedback-plugin:push` | Pushes captures to Figma. Share the file URL with stakeholders. |
| 3 | *(wait)* | Stakeholders leave comments on Figma frames. |
| 4 | `/figma-feedback-plugin:pull` | Pulls those comments locally. |
| 5 | `/figma-feedback-plugin:plan` | Generates `themes.md` and `plan.md`. Review and edit `plan.md`. |
| 6 | *(implement)* | Use your normal Claude Code coding session. Track each addressed item in `feedback/round-N/addressed.md`. |
| 7 | `/figma-feedback-plugin:close-round` | Writes the per-round summary to Figma's Changelog page and bumps the round counter. |
| 8 | Back to step 1 for Round N+1 | |

## Files this plugin manages in your repo

- `figma-feedback.config.json` — your routes, viewport, Figma file key, changelog page name
- `.env` — your `FIGMA_TOKEN` (REST only; MCP auth is separate)
- `feedback/.round-state.json` — current round counter
- `feedback/round-N/` — per-round artifacts:
  - `captures/*.png` — screenshots
  - `push-manifest.json` — what was uploaded and which Figma frame IDs they became
  - `comments.json` — stakeholder comments for this round
  - `themes.md` — clustered themes (Claude-written)
  - `plan.md` — proposed changes (Claude-written, you edit)
  - `addressed.md` — what you actually implemented (you write)

## JSON Schema editor support

If your editor supports JSON Schema linting for `.json` files, add this to your `figma-feedback.config.json`:

```json
{
  "$schema": "/absolute/path/to/figma-feedback-plugin/config.schema.json",
  …
}
```

(Plugin installs are not in your repo's `node_modules`, so the path must be absolute.)

## Manual smoke test (run before every release)

This plugin's CI cannot verify the Figma MCP integration end-to-end. Before tagging a release, run the full smoke test against a throwaway Figma file:

1. Create a fresh Figma file you don't care about. Note the file URL.
2. In a temporary directory, create a minimal dev server (e.g., `npx http-server` serving two HTML pages at `/login` and `/dashboard`).
3. Run `/figma-feedback-plugin:init` and provide the throwaway file URL.
4. Run `/figma-feedback-plugin:capture` — verify both PNGs appear in `feedback/round-1/captures/`.
5. Run `/figma-feedback-plugin:push` — verify the Figma file now has a `Round 1` page with 2 frames, each filled with the captured image.
6. Add 2 comments in Figma on those frames.
7. Run `/figma-feedback-plugin:pull` — verify `feedback/round-1/comments.json` contains both comments.
8. Run `/figma-feedback-plugin:plan` — verify `themes.md` and `plan.md` are reasonable.
9. Edit `plan.md` to mark one item checked. Create `feedback/round-1/addressed.md` with a single bullet.
10. Run `/figma-feedback-plugin:close-round` — verify the Figma file has a `Changelog` page with a `Round 1 → Round 2` frame.
11. Verify `feedback/.round-state.json` shows `currentRound: 2`.

If any step fails, the corresponding phase in `.claude-plugin/skills/figma-feedback/SKILL.md` is the place to look.

## Limitations (v1)

- Local dev server only. Deployed-URL capture (Vercel/Netlify/Pages) deferred.
- Full-screen captures only. No component-level or state captures.
- Single Figma file per project.
- No fallback if the Figma MCP is unavailable — commands fail hard with setup instructions.
- Official Figma MCP's "Write to canvas" feature is currently beta-free; Figma has indicated it will become a paid feature in the future.

## Development

```bash
npm install
npm test           # run all unit + integration tests
npm run build      # type-check only
```

Tests use vitest. The Playwright integration test downloads Chromium on first install (`npx playwright install chromium`).
