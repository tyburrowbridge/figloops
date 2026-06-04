---
name: figloops-next-close
description: figloops close-round phase handler — writes the changelog, bumps the round, and re-seeds tasks
---

## Setup
Resolve `FIGLOOPS_PLUGIN_DIR` from env or `.env`. If unset, abort. Scripts: `cd "<CONSUMING_REPO>" && "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/<name>.ts" <args>`. Always double-quote paths.

## Errors
TS exits non-zero → relay stderr verbatim. MCP fail → relay error + partial state, don't advance.

---

## Handler

1. Mark `[FIGLOOPS] Close round` as `in_progress`.

2. Compute today's date (UTC, `YYYY-MM-DD`).

3. Run:
   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/format-changelog.ts" <round> <round+1> <date>
   ```
   Capture the markdown string from stdout.

4. Read `figloops.config.json` for `figma.fileKey` and `figma.changelogPageName`.

5. Call MCP to find or create page `<changelogPageName>` in `<fileKey>`. Capture `pageId`.

6. Call MCP to enumerate existing frames on that page. Compute next y-position (stack vertically; start at y=0 if page is empty).

7. Call MCP to create a text frame:
   - name: `Round <round> → Round <round+1>`
   - position: x=0, y=`<computed>`
   - width: 800
   - content: the formatted markdown from step 3

8. Regenerate snapshot:
   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/render-snapshot.ts"
   ```

9. Bump round + reset phase:
   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/advance-phase.ts" capture
   ```

10. Re-create 9 round tracker tasks for the new round (call `TaskCreate` 9 times in a single message, all `pending`):
    - `[FIGLOOPS] Capture screenshots`
    - `[FIGLOOPS] Push to Figma`
    - `[FIGLOOPS] Wait for user comments`
    - `[FIGLOOPS] Pull comments`
    - `[FIGLOOPS] Review comments`
    - `[FIGLOOPS] Cluster themes`
    - `[FIGLOOPS] Approve plan`
    - `[FIGLOOPS] Implement changes`
    - `[FIGLOOPS] Close round`

11. Print as the final output (after all tool calls, so it lands below the task list):
    ```
    ---
    🏁 **Round <round> complete!**

    > ▶ **Run `/figloops:next`** to capture screenshots and begin Round <round+1>.
    ---
    ```
