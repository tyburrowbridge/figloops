---
name: figloops
description: Wizard-driven figloops workflow. Use when handling /figloops:* commands. The skill has four phases (init, next, status, help); `next` is a state machine over feedback/state.json with four interactive gates plus one passive gate per round. Coordinates TS helper scripts with the Figma MCP server.
---

# figloops orchestration

You are handling a phase of the figloops plugin. The slash command tells you which phase: `init`, `next`, `status`, or `help`.

## Resolving the plugin directory

The user runs slash commands in a consuming repo, not in the plugin's repo. The skill needs to invoke the plugin's TS helper scripts. Resolve the plugin path like this:

1. Read `$FIGLOOPS_PLUGIN_DIR` from the user's environment (or from the consuming repo's `.env`).
2. If unset and the phase is `init`, ask the user for it and write it into the new `.env` along with `FIGMA_TOKEN`.
3. If unset for any other phase, abort with: `"FIGLOOPS_PLUGIN_DIR is not set. Add it to .env or your shell. See README."`

For the rest of this skill, when you see `<PLUGIN_DIR>` in commands, substitute the actual absolute path. Run TS scripts as: `cd <CONSUMING_REPO> && <PLUGIN_DIR>/node_modules/.bin/tsx <PLUGIN_DIR>/scripts/<name>.ts <args>`.

## MCP preflight (used by init + every non-status invocation of next)

Before any phase that touches Figma:

1. List your available MCP tools. Confirm a Figma MCP write tool is available (typically `use_figma` from the official `figma/mcp-server-guide` server, or `figma_execute` from `southleft/figma-console-mcp`).
2. If no Figma MCP write tool is connected, abort and tell the user:
   - That the Figma MCP server is required.
   - To install the official Figma MCP server (remote mode) per https://github.com/figma/mcp-server-guide.
   - That the community alternative `southleft/figma-console-mcp` is documented as a free option.
   - Do not proceed with any other steps.
3. For init only, also run a probe call: ask the MCP for the user's identity or any read-only operation it supports. If it errors with auth, abort init with the MCP setup link.

---

## Phase: `init`

The init wizard refuses to complete until every external check passes.

1. **MCP preflight** (above). On failure, abort here.

2. **Suggest a fresh Figma file** (passive tip; do not block):

   > Recommended — create a fresh Figma file for this project before continuing. You'll get a clean slate per project and avoid polluting an existing design file.

3. **Determine `<PLUGIN_DIR>`.** It is this skill's parent directory's parent (i.e., `.../figloops`). If the user hasn't already set `FIGLOOPS_PLUGIN_DIR`, print the absolute path and tell the user you'll write it into `.env` in a later step.

4. **Figma PAT validation.** Ask the user for their Figma Personal Access Token (link: https://www.figma.com/developers/api#access-tokens). If they already have one in `.env`, read it. Validate by calling:

   ```bash
   <PLUGIN_DIR>/node_modules/.bin/tsx -e "import('<PLUGIN_DIR>/src/figma-client.js').then(m => m.getMe({ token: process.env.FIGMA_TOKEN }).then(me => console.log(JSON.stringify(me)))).catch(e => { console.error(e.message); process.exit(1); })"
   ```

   (Set `FIGMA_TOKEN=<token>` in the env for this invocation; do not write to `.env` yet.) On failure (401 / network), abort init with the error message + PAT setup link.

5. **Figma file URL validation.** Ask the user for their Figma file URL. Accept any of:
   - `https://www.figma.com/file/<KEY>/<NAME>`
   - `https://www.figma.com/design/<KEY>/<NAME>`
   - `https://www.figma.com/proto/<KEY>/<NAME>`

   Extract the file key (the segment between `/file/`, `/design/`, or `/proto/` and the next `/`). Validate access:

   ```bash
   <PLUGIN_DIR>/node_modules/.bin/tsx -e "import('<PLUGIN_DIR>/src/figma-client.js').then(m => m.getFile({ fileKey: '<KEY>', token: process.env.FIGMA_TOKEN }).then(f => console.log(JSON.stringify(f)))).catch(e => { console.error(e.message); process.exit(1); })"
   ```

   On 403/404, abort with the explicit reason (the script prints the right message already) and re-prompt for a corrected URL.

6. **Project config.** Ask for:
   - Dev server URL (default offer: `http://localhost:3000`)
   - Viewport (default: 1440×900) — confirm or take overrides
   - Changelog page name (default: `Changelog`)
   - Starter routes — require at least 1 `{label, path}` pair; encourage 2+

7. **Write `figloops.config.json`** in the cwd:

   ```json
   {
     "$schema": "<absolute path to PLUGIN_DIR>/config.schema.json",
     "devServer": { "url": "<URL>", "waitFor": "networkidle" },
     "viewport": { "width": <W>, "height": <H> },
     "figma": { "fileKey": "<KEY>", "changelogPageName": "<NAME>" },
     "routes": [ { "label": "<LABEL>", "path": "<PATH>" } ]
   }
   ```

8. **Write `.env`** (do NOT overwrite if it exists — instead print the keys the user should add manually):

   ```
   FIGMA_TOKEN=<token from step 4>
   FIGLOOPS_PLUGIN_DIR=<PLUGIN_DIR>
   ```

9. **Initialize state.** Run:

   ```bash
   <PLUGIN_DIR>/node_modules/.bin/tsx -e "import('<PLUGIN_DIR>/src/state.js').then(m => { m.initState('feedback/state.json'); console.log('initialized'); })"
   ```

10. **Create the round tracker via TaskCreate.** Call `TaskCreate` 9 times in a single message to seed the visible round phases (all `pending`):
    - `[figloops] Capture screenshots`
    - `[figloops] Push to Figma`
    - `[figloops] Wait for stakeholder comments`
    - `[figloops] Pull comments`
    - `[figloops] Review comments`
    - `[figloops] Cluster themes`
    - `[figloops] Approve plan`
    - `[figloops] Implement changes`
    - `[figloops] Close round`

11. **Print the "ready" summary** to the user:

    > Setup complete. Round 1 is ready to begin. Run `/figloops:next` to capture screenshots of your configured routes.

---

## Phase: `next`

`next` is a state machine over `feedback/state.json`. Steps:

1. Run MCP preflight (above) unless `currentPhase` is `await-comments` and you're only doing the passive check.
2. Read `feedback/state.json` via:

   ```bash
   cat feedback/state.json
   ```

3. Parse `currentPhase`. Dispatch to the section below matching that phase. Each section ends by either (a) advancing `currentPhase` via `scripts/advance-phase.ts`, or (b) stopping at a user gate.

### Phase handler: `capture`

1. Mark task `[figloops] Capture screenshots` as `in_progress` via `TaskUpdate`.
2. Run:

   ```bash
   <PLUGIN_DIR>/node_modules/.bin/tsx <PLUGIN_DIR>/scripts/capture.ts
   ```

   Capture stdout JSON: `{ round, captures: [{label, path, filename}], failed: [] }`.
3. Regenerate snapshot:

   ```bash
   <PLUGIN_DIR>/node_modules/.bin/tsx <PLUGIN_DIR>/scripts/render-snapshot.ts
   ```

4. Present the **preview gate** (Gate 1):

   ```
   Captured N routes for Round <round>:
     01-login.png        → Frame "01 - Login"
     02-dashboard.png    → Frame "02 - Dashboard"
     ...
   Expected Figma layout on page "Round <round>":
     3 columns wide, rows added as needed.

   Reply with: approve / recapture / cancel
   ```

5. On `approve`: mark task complete, advance: `tsx <PLUGIN_DIR>/scripts/advance-phase.ts push`. Then continue at the `push` handler.
6. On `recapture`: re-run step 2.
7. On `cancel`: stop here. Do not advance state.

### Phase handler: `push`

1. Mark `[figloops] Push to Figma` as `in_progress`.
2. Run:

   ```bash
   <PLUGIN_DIR>/node_modules/.bin/tsx <PLUGIN_DIR>/scripts/upload-images.ts
   ```

   Parse stdout: `{ round, uploads: [{label, filename, imageHash}], failed: [] }`. If `uploads` is empty, abort and surface the error.
3. Read `figloops.config.json` to get `figma.fileKey` and `viewport.width`.
4. Compute a human-readable timestamp for the page name. Run:

   ```bash
   date '+%-d %B %Y (%-I:%M %p)'
   ```

   Capture stdout (e.g., `20 May 2026 (2:30 PM)`). Construct the page name as `Round <round> — <timestamp>` (em dash separator). Call the Figma MCP to find or create the page with that name in `<fileKey>`. Capture the returned `pageId`. Note: if push is re-run minutes after a first attempt, the new timestamp won't match the existing page, and a duplicate `Round <round> — <new timestamp>` page will be created. The user can delete the orphan manually.
5. For each upload (preserve order):
   - Compute grid position: `col = i % 3`, `row = floor(i / 3)`. Frame x: `col * (viewport.width + 40)`. Frame y: `row * 1000` (provisional — actual image heights unknown until MCP returns).
   - Frame name: `<NN> - <label>` (2-digit one-indexed).
   - Call MCP to **create the frame** on the page. Capture the returned `frameId`. Do NOT set fills in this call.
6. **Apply image fills via MCP code execution** (the MCP's frame-creation tool does not always auto-bind hashes). For each `(frameId, imageHash)`, call MCP to run:

   ```js
   const node = figma.getNodeById('<frameId>');
   node.fills = [{ type: 'IMAGE', imageHash: '<hash>', scaleMode: 'FILL' }];
   ```

   Verify each fill is applied before moving on.

7. Persist the manifest into state:

   ```bash
   echo '<manifest JSON>' | <PLUGIN_DIR>/node_modules/.bin/tsx <PLUGIN_DIR>/scripts/set-manifest.ts
   ```

   Where `<manifest JSON>` is `{ "pageId": "<id>", "frames": [{ "label": "...", "frameId": "...", "imageHash": "..." }, ...] }`.

8. Regenerate snapshot.
9. Print the Figma file URL and tell the user to share it with stakeholders.
10. Mark task complete. Advance: `tsx <PLUGIN_DIR>/scripts/advance-phase.ts await-comments`. Continue at `await-comments` handler.

### Phase handler: `await-comments`

1. Mark `[figloops] Wait for stakeholder comments` as `in_progress`.
2. Run pull script (it's safe to call when there are no comments yet):

   ```bash
   <PLUGIN_DIR>/node_modules/.bin/tsx <PLUGIN_DIR>/scripts/pull-comments.ts
   ```

   Parse stdout: `{ round, totalComments, forThisRound }`.
3. **If `forThisRound === 0`:** stay in `await-comments`. Print:

   > No comments yet for Round <round>. Re-run `/figloops:next` once stakeholders have responded.

   Do not advance. Do not change task tracker state.
4. **If `forThisRound > 0`:** mark task complete. Advance: `tsx <PLUGIN_DIR>/scripts/advance-phase.ts pull`. Continue at `pull` handler.

### Phase handler: `pull`

(Reached when await-comments succeeded.)

1. Mark `[figloops] Pull comments` as `in_progress`.
2. (Comments are already in `state.json` from the await-comments handler's pull invocation. No additional work needed.)
3. Regenerate snapshot.
4. Mark task complete. Advance: `tsx <PLUGIN_DIR>/scripts/advance-phase.ts comment-review`. Continue at `comment-review`.

### Phase handler: `comment-review`

1. Mark `[figloops] Review comments` as `in_progress`.
2. Read `feedback/state.json`. Render the comments grouped by frame:

   ```
   Round <round> — Comments to review (<N> total)

   Frame "01 - Login":
     - Sarah Lee (#12): "The CTA below the form is hard to find."
     - Mike Chen (#17): "Form copy is unclear; add helper text."

   Frame "02 - Dashboard":
     - Sarah Lee (#23): "Nav doesn't show what's active."

   Reply with one of:
     continue           (advance to clustering)
     pull-again         (re-fetch comments from Figma, e.g. more arrived)
     cancel             (abort the round; state reverts to await-comments)
   ```

3. On `continue`: mark task complete, advance: `tsx <PLUGIN_DIR>/scripts/advance-phase.ts cluster`. Continue at `cluster` handler.
4. On `pull-again`: re-run pull-comments script, regenerate snapshot, re-render the comment list, stay in this phase.
5. On `cancel`: advance back to `await-comments`: `tsx <PLUGIN_DIR>/scripts/advance-phase.ts await-comments`. Stop.

### Phase handler: `cluster`

1. Mark `[figloops] Cluster themes` as `in_progress`.
2. Read `feedback/state.json`. Cluster the current round's comments by inferred semantic theme. Do not group by frame or by author. One theme may span multiple frames.
3. Build the `themes` array and a proposed `plan` array. Each plan item gets:
   - `id`: `p1`, `p2`, `p3`, ... in order
   - `themeName`: matches one of the themes
   - `change`: a concrete proposed change
   - `drivesFrom`: array of comment IDs
   - `status`: `proposed`

4. Update state.json with the new themes and plan. Both are written via dedicated CLIs that take stdin:

   ```bash
   echo '<THEMES_JSON>' | <PLUGIN_DIR>/node_modules/.bin/tsx <PLUGIN_DIR>/scripts/set-themes.ts
   echo '{"action":"set","items":[ ... ]}' | <PLUGIN_DIR>/node_modules/.bin/tsx <PLUGIN_DIR>/scripts/update-plan.ts
   ```

   Where `<THEMES_JSON>` is a JSON array of `{name, commentIds, summary}` objects, and the update-plan payload's `items` is a JSON array of `{id, themeName, change, drivesFrom, status: 'proposed'}` objects.

5. Regenerate snapshot.
6. Mark task complete. Advance: `tsx <PLUGIN_DIR>/scripts/advance-phase.ts plan-approval`. Continue at `plan-approval`.

### Phase handler: `plan-approval`

1. Mark `[figloops] Approve plan` as `in_progress`.
2. Read state. Render the plan as numbered items grouped by theme:

   ```
   Round <round> — Plan approval

   Theme: Navigation clarity
     1. Add breadcrumbs to Dashboard
        Drives from: Sarah Lee (#12), Mike Chen (#17)
     2. Highlight active nav item
        Drives from: Sarah Lee (#23)

   Theme: Color contrast
     3. Increase contrast on secondary buttons
        Drives from: Anita Roy (#41), Mike Chen (#44)

   Reply with one of:
     approve all
     approve 1,3        (and reject the rest)
     edit 2: <new wording>   (re-prompt for approval after edit)
     reject all         (close round with empty changelog note)
   ```

3. Parse the user's reply:
   - `approve all`: build a status-update payload with every item `→ approved`.
   - `approve 1,3`: items 1 and 3 → `approved`, all others → `rejected`.
   - `edit N: <text>`: pipe an updated `set` payload back through update-plan, regenerate snapshot, re-render the numbered list (stay in phase).
   - `reject all`: status-update payload with every item → `rejected`. Advance directly to `close` (skip implement).
4. Apply the update via `update-plan.ts`. Regenerate snapshot.
5. If any items are approved: mark task complete; advance: `tsx <PLUGIN_DIR>/scripts/advance-phase.ts implement`. Continue at `implement`.
6. If `reject all`: mark task complete; advance: `tsx <PLUGIN_DIR>/scripts/advance-phase.ts close`. Continue at `close`.

### Phase handler: `implement`

1. Mark `[figloops] Implement changes` as `in_progress`.
2. Read state. List approved items with status:

   ```
   Round <round> — Implementing (<shipped> of <approved> shipped)

   [✓] 1. Add breadcrumbs to Dashboard
   [ ] 2. Highlight active nav item
   [ ] 3. Increase contrast on secondary buttons

   Reply with one of:
     done 2             (mark item 2 shipped)
     done 2,3           (mark multiple shipped)
     close              (close round; remaining approved items become 'dropped')
   ```

3. Parse the user's reply:
   - `done N` / `done N,M`: build a status-update payload marking those items `→ shipped`. Apply, regenerate snapshot, re-render the list, stay in phase. If now all approved items are `shipped`, auto-advance.
   - `close`: status-update payload marking all remaining `approved` items as `dropped`. Apply, advance.
4. When advancing: `tsx <PLUGIN_DIR>/scripts/advance-phase.ts close`. Continue at `close`.

### Phase handler: `close`

1. Mark `[figloops] Close round` as `in_progress`.
2. Compute today's date (UTC YYYY-MM-DD).
3. Run:

   ```bash
   <PLUGIN_DIR>/node_modules/.bin/tsx <PLUGIN_DIR>/scripts/format-changelog.ts <round> <round + 1> <date>
   ```

   Capture the markdown string from stdout.
4. Read `figloops.config.json` for `figma.fileKey` and `figma.changelogPageName`.
5. Call MCP to find or create a page named `<changelogPageName>` in the file. Capture `pageId`.
6. Call MCP to enumerate existing frames on that page and compute the next y-position (stack vertically; if empty, start at y=0).
7. Call MCP to create a text frame:
   - name: `Round <round> → Round <round + 1>`
   - position: x=0, y=<computed>
   - width: 800
   - content: the formatted markdown
8. Regenerate snapshot one final time.
9. Bump round + reset phase: `tsx <PLUGIN_DIR>/scripts/advance-phase.ts capture`.
10. Re-create the 9 round tracker tasks for the new round (call `TaskCreate` 9 times with the `[figloops]` prefix titles).
11. Print:

    > Round <round> closed. Round <round + 1> begins — run `/figloops:next` to capture screenshots.

---

## Phase: `status`

Read `feedback/state.json`. Render the current round tracker by listing the 9 figloops tasks and their statuses (use `TaskList` to enumerate, filter to those whose subject starts with `[figloops]`). Add a header line:

```
Round <currentRound> · phase: <currentPhase>
```

Do not advance state. Do not call MCP.

---

## Phase: `help`

The `commands/help.md` file handles this directly without invoking the skill. If for some reason this phase is dispatched here, defer to `commands/help.md` and produce identical output.

---

## Error handling principles

- TS script exits non-zero → relay stderr verbatim, do not retry automatically (except where the script itself retries, e.g. uploads).
- MCP call fails → relay the MCP error verbatim. Note any partial state ("images were uploaded but no frames were created — you can clean up by deleting the Round <N> page if it was created"). Do not advance state.
- State file load fails → abort the command with the load error and tell the user how to recover (back up `feedback/state.json` and re-run `/figloops:init`).

## Notes for future you

- `<PLUGIN_DIR>` is the absolute path where the plugin is installed (e.g., `~/.claude/plugins/figloops`).
- All TS scripts assume cwd is the consuming repo.
- Figma MCP exact tool names vary by server. Official Figma MCP exposes `use_figma`; community `southleft/figma-console-mcp` exposes typed tools. Adapt as needed.
- The `[figloops]` task subject prefix exists to group tasks visually in Claude Code's tracker even if the user has unrelated tasks in the same session.
