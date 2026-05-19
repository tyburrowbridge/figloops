---
name: figma-feedback
description: Orchestrate the figma-feedback-plugin workflow. Use when handling /figma-feedback-plugin:* commands. Coordinates TS helper scripts and the Figma MCP server to capture localhost prototypes, push them to Figma, pull stakeholder comments, propose a change plan, and write a per-round changelog.
---

# figma-feedback orchestration

You are handling a phase of the figma-feedback-plugin workflow. The slash command tells you which phase: `init`, `capture`, `push`, `pull`, `plan`, or `close-round`.

## Resolving the plugin directory

The user runs slash commands in a consuming repo, not in the plugin's repo. The skill needs to invoke the plugin's TS helper scripts. Resolve the plugin path like this:

1. Read `$FIGMA_FEEDBACK_PLUGIN_DIR` from the user's environment (or from the consuming repo's `.env`).
2. If unset and the phase is `init`, ask the user for it and write it into the new `.env` along with `FIGMA_TOKEN`.
3. If unset for any other phase, abort with: `"FIGMA_FEEDBACK_PLUGIN_DIR is not set. Add it to .env or your shell. See README."`

For the rest of this skill, when you see `<PLUGIN_DIR>` in commands, substitute the actual absolute path. Run TS scripts as: `cd <CONSUMING_REPO> && <PLUGIN_DIR>/node_modules/.bin/tsx <PLUGIN_DIR>/scripts/<name>.ts <args>`.

## Universal preflight (skip only for `capture`)

Before doing anything else for any phase except `capture`:

1. List your available MCP tools. Confirm a Figma MCP write tool is available (typically `use_figma` from the official `figma/mcp-server-guide` server, or `figma_execute` from `southleft/figma-console-mcp`).
2. If no Figma MCP write tool is connected, abort and tell the user:
   - That the Figma MCP server is required for this command.
   - To install the official Figma MCP server (remote mode) per https://github.com/figma/mcp-server-guide.
   - That the community alternative `southleft/figma-console-mcp` is documented in this plugin's README as a free option.
   - Do not proceed with any other steps.

This preflight runs in `init` too — it's how we know the user has set up the MCP before they invest time in the rest of setup.

## Phase: `init`

1. Run the MCP preflight above.
2. Determine `<PLUGIN_DIR>` (this skill's directory's parent's parent — `.../figma-feedback-plugin`). If the user hasn't already set `FIGMA_FEEDBACK_PLUGIN_DIR`, tell them the absolute path and ask them to confirm it. You'll write it into `.env` in step 8.
3. Ask the user for their Figma file URL. Accept any of these formats and extract the file key (the path segment after the format prefix):
   - `https://www.figma.com/file/<KEY>/<NAME>` (legacy)
   - `https://www.figma.com/design/<KEY>/<NAME>` (current default)
   - `https://www.figma.com/proto/<KEY>/<NAME>` (prototype mode — same underlying file)
4. Ask the user for their dev server URL (default offer: `http://localhost:3000`).
5. Ask the user for the changelog page name (default offer: `Changelog`).
6. Ask the user for an initial list of routes (label + path pairs). Encourage at least 2 to start.
7. Write `figma-feedback.config.json` in the cwd with the structure from the plugin's `config.schema.json`. Example:
   ```json
   {
     "devServer": { "url": "<URL>", "waitFor": "networkidle" },
     "viewport": { "width": 1440, "height": 900 },
     "figma": { "fileKey": "<KEY>", "changelogPageName": "<NAME>" },
     "routes": [
       { "label": "<LABEL>", "path": "<PATH>" }
     ]
   }
   ```
8. Copy `<PLUGIN_DIR>/.env.example` to the consuming repo's `.env` (do NOT overwrite if it already exists — instead, tell the user to manually add any missing keys). Fill in `FIGMA_FEEDBACK_PLUGIN_DIR=<PLUGIN_DIR>` automatically. Tell the user to fill in `FIGMA_TOKEN` (link: https://www.figma.com/developers/api#access-tokens).
9. Initialize round state by running: `<PLUGIN_DIR>/node_modules/.bin/tsx <PLUGIN_DIR>/scripts/init-state.ts` from the consuming repo's cwd. Expected stdout: `{ "initialized": ".../feedback/.round-state.json", "currentRound": 1 }`.
10. Tell the user the next step is to fill in `.env`, then run `/figma-feedback-plugin:capture`.

## Phase: `capture`

1. Run `<PLUGIN_DIR>/node_modules/.bin/tsx <PLUGIN_DIR>/scripts/capture.ts` from the consuming repo's cwd. Capture stdout (JSON) and stderr (logs).
   - If the user passed route labels as arguments, tell them route filtering is not implemented in v1 and offer to capture all routes.
2. Parse the stdout JSON: `{ round, captures: [{label, path}], failed: [...] }`.
3. Present a preview gate to the user:
   ```
   Captured N routes for Round <round>:
     01-login.png        → Frame "01 - Login"
     02-dashboard.png    → Frame "02 - Dashboard"
     …
   Expected Figma layout on page "Round <round>":
     3 columns wide, rows added as needed.
   Approve push? (yes / re-capture / cancel)
   ```
4. If the user approves, instruct them to run `/figma-feedback-plugin:push`. Do not auto-run push.
5. If any captures failed, list them with their error messages so the user can fix and re-run.

## Phase: `push`

1. Run MCP preflight (above).
2. Run `<PLUGIN_DIR>/node_modules/.bin/tsx <PLUGIN_DIR>/scripts/upload-images.ts` from the consuming repo's cwd. Capture stdout JSON: `{ round, uploads: [{label, filename, imageHash}], failed: [...] }`.
3. If `uploads` is empty, abort and tell the user the upload script reported no uploads.
4. Read the consuming repo's `figma-feedback.config.json` to get `figma.fileKey` and `viewport.width`.
5. Call the Figma MCP to find or create the page named `Round <round>`. The exact tool call depends on which MCP is connected; for the official Figma MCP (`use_figma`), the operation is "find or create a page in file `<fileKey>` named `Round <round>`." Capture the returned page ID.
6. For each upload in `uploads` (order matters; preserve the order from the script's output):
   - Compute grid position with `col = i % 3` and `row = floor(i / 3)`. Frame dimensions: `viewport.width` × the actual PNG height. Use `scaleMode: 'FILL'` per the spec.
   - Frame name: `<NN> - <label>` where NN is the 2-digit one-indexed position.
   - Frame x: `col * (viewport.width + 40)`. Frame y: `row * 1000` (provisional; final positioning is best-effort since we don't know image heights yet).
   - Call the Figma MCP to **create the frame** on the page with that name, size, and position. Capture the returned frame node ID. Do NOT set fills in this same call — see step 6a.

6a. **Apply image fills directly via Plugin API code.** The MCP's typical frame-creation tool returns successful image hashes but does not always auto-bind them to the new frame's fills (observed: hashes returned but fills empty after creation). Work around this by executing Plugin API code after the frame exists, one frame at a time:

   ```js
   // Pseudocode for the call the skill makes via the MCP's code-execution tool
   // (e.g., use_figma "run code" or figma_execute for the community MCP):
   const node = figma.getNodeById('<frameId>');
   node.fills = [{ type: 'IMAGE', imageHash: '<hash>', scaleMode: 'FILL' }];
   ```

   Map each frame's `<frameId>` to its `<hash>` by preserving the order from the `uploads` array. Verify each fill applied before moving on (a quick `figma.getNodeById('<frameId>').fills` check is enough).
7. Write `feedback/round-<round>/push-manifest.json`:
   ```json
   {
     "round": <round>,
     "page_id": "<pageId>",
     "frames": [
       { "label": "<label>", "frame_id": "<frameId>", "image_hash": "<hash>" }
     ]
   }
   ```
8. Tell the user the Figma file URL and that they can share it with stakeholders.

## Phase: `pull`

1. Run MCP preflight.
2. Run `<PLUGIN_DIR>/node_modules/.bin/tsx <PLUGIN_DIR>/scripts/pull-comments.ts` from the consuming repo's cwd. Capture stdout JSON: `{ round, totalComments, forThisRound, wroteTo }`.
3. Tell the user `forThisRound` comments were saved to `wroteTo`.
4. If `forThisRound` is 0, tell the user no feedback exists yet for this round and suggest waiting before running `/figma-feedback-plugin:plan`.

## Phase: `plan`

1. Run MCP preflight.
2. Read `feedback/round-<round>/comments.json` (resolve `<round>` from `feedback/.round-state.json`).
3. If the file does not exist, tell the user to run `/figma-feedback-plugin:pull` first.
4. Cluster the comments by inferred semantic theme. Do not group by frame or by author — group by what the comment is *about* (e.g., "Navigation clarity", "Color contrast", "Onboarding flow"). One theme may span multiple frames.
5. Write `feedback/round-<round>/themes.md` with one section per theme:
   ```markdown
   ## Theme: <name>
   Comments: #<id> (<author>), #<id> (<author>), …
   Summary: <2-3 sentence description of what the theme captures>
   ```
6. Write `feedback/round-<round>/plan.md` with proposed changes grouped by the same themes:
   ```markdown
   ## Proposed changes

   ### Theme: <name>
   1. [ ] <Concrete change>
      Drives from: #<id>, #<id>
   2. [ ] <Concrete change>
      Drives from: #<id>
   ```
7. Tell the user to review and edit `plan.md`: uncheck items they reject, reorder, add notes. Tell them to track what they actually implemented in `feedback/round-<round>/addressed.md` (one bullet per change, in the format `- <change description>. Drove from: #<id>, #<id>`).

## Phase: `close-round`

1. Run MCP preflight.
2. Resolve current round from `feedback/.round-state.json`.
3. Read `feedback/round-<round>/plan.md` and `feedback/round-<round>/addressed.md`. If either is missing, abort and tell the user which one and why it's needed.
4. Compute the round summary by running the format-changelog CLI from the consuming repo's cwd:
   ```bash
   <PLUGIN_DIR>/node_modules/.bin/tsx <PLUGIN_DIR>/scripts/format-changelog.ts \
     <round> <round + 1> <YYYY-MM-DD> \
     feedback/round-<round>/plan.md \
     feedback/round-<round>/addressed.md
   ```
   Capture the markdown string from stdout.
5. Read the consuming repo's `figma-feedback.config.json` to get `figma.fileKey` and `figma.changelogPageName`.
6. Call the Figma MCP to find or create a page with name `<changelogPageName>` in the file. Capture the page ID.
7. Call the Figma MCP to enumerate existing frames on that page to determine the next frame's y-position (vertical stack below existing frames). If no existing frames, start at y=0.
8. Call the Figma MCP to create a text frame on that page:
   - Name: `Round <round> → Round <round + 1>`
   - Position: x=0, y=<computed>
   - Width: 800
   - Content: the markdown string from step 4 (rendered as plain text or RTF as the MCP supports; the official MCP's text creation accepts plain text by default).
9. Bump the round state by running a small inline tsx command from the consuming repo's cwd:
   ```bash
   <PLUGIN_DIR>/node_modules/.bin/tsx -e "import('<PLUGIN_DIR>/src/round-state.js').then(m => { const n = m.bumpRound('feedback/.round-state.json'); console.log('currentRound now', n); })"
   ```
10. Tell the user the round summary was written to the `Changelog` page and that the next `/figma-feedback-plugin:capture` will start Round `<round + 1>`.

## Error handling principles

- TS script exits with non-zero → relay the stderr verbatim to the user, do not retry automatically.
- MCP call fails → relay the MCP error verbatim, note any partial state (e.g., "images were uploaded but no frames were created — you can clean up the orphaned image hashes by deleting the Round <N> page if it was created").
- Never silently degrade. Never fall back to manual seed instructions. The spec deliberately removed that fallback.

## Notes for future you

- `<PLUGIN_DIR>` is the absolute path to where this plugin is installed (e.g., `~/.claude/plugins/figma-feedback-plugin`). The consuming repo (where the user runs the slash commands) has its own `figma-feedback.config.json`, `.env`, and `feedback/` directory.
- All TS scripts assume the cwd is the consuming repo, not the plugin directory.
- The Figma MCP's exact tool name and argument shape varies by server. The official Figma MCP exposes a single `use_figma` tool that accepts natural-language operations; the community `southleft/figma-console-mcp` exposes typed tools like `figma_execute` and `figma_create_child`. Adapt the calls in steps above to whatever shape your connected MCP expects.
