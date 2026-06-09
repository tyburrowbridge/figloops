---
name: figloops-next-close
description: Close phase — write changelog and start next round
user-invocable: false
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

5. Call MCP **once** to find or create the changelog page, compute the next y-position from existing frames, and create the text frame — all in a single JS execution. Embed `changelogPageName`, `frameName` (`Round <round> → Round <round+1>`), and `markdownContent` as literals.

   ```js
   const changelogPageName = '<name>';
   const frameName = 'Round <N> → Round <N+1>';
   const markdownContent = `<escaped changelog markdown>`;

   let page = figma.root.children.find(p => p.name === changelogPageName);
   if (!page) { page = figma.createPage(); page.name = changelogPageName; }
   await figma.setCurrentPageAsync(page);

   const existingFrames = page.children.filter(n => 'y' in n && 'height' in n);
   const nextY = existingFrames.length > 0
     ? Math.max(...existingFrames.map(f => f.y + f.height)) + 40
     : 0;

   await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
   const textNode = figma.createText();
   textNode.characters = markdownContent;
   textNode.fontSize = 14;

   const frame = figma.createFrame();
   frame.name = frameName;
   frame.x = 0;
   frame.y = nextY;
   frame.resize(800, 100);
   frame.appendChild(textNode);
   frame.resize(800, textNode.height + 40);
   page.appendChild(frame);

   return JSON.stringify({ pageId: page.id, frameId: frame.id });
   ```

   Capture `pageId` and `frameId` from the return value.

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
