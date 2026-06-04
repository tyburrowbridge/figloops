---
name: figloops-next-push
description: figloops push-to-Figma phase handler — uploads images and creates Figma frames
---

## Setup
Resolve `FIGLOOPS_PLUGIN_DIR` from env or `.env`. If unset, abort. Scripts: `cd "<CONSUMING_REPO>" && "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/<name>.ts" <args>`. Always double-quote paths.

## Errors
TS exits non-zero → relay stderr verbatim. MCP fail → relay error, note partial state ("images uploaded but no frames created — delete the Round <N> page if it was created"), don't advance. State load fail → abort.

---

## Handler

1. Mark `[FIGLOOPS] Push to Figma` as `in_progress`.

2. Run:
   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/upload-images.ts"
   ```
   Parse stdout: `{ round, uploads: [{label, filename, imageHash}], failed: [] }`. If `uploads` is empty, abort and surface the error.

3. Read `figloops.config.json` for `figma.fileKey` and `viewport.width`.

4. Get a timestamp:
   ```bash
   date '+%-d %B %Y (%-I:%M %p)'
   ```
   Construct page name: `Round <round> — <timestamp>` (em dash). Call MCP to find or create this page in `<fileKey>`. Capture `pageId`.

   Note: if push is re-run, the new timestamp creates a new page with a slightly different name. The user can delete any orphaned page manually.

5. For each upload in order (`i` is 0-indexed):
   - Grid: `col = i % 3`, `row = floor(i / 3)`. Frame x: `col * (viewport.width + 40)`. Frame y: `row * 1000`.
   - Frame name: `<NN> - <label>` (2-digit one-indexed).
   - Call MCP to **create the frame** on the page. Capture `frameId`. Do NOT set fills in this call.

6. **Apply image fills via MCP** for each `(frameId, imageHash)`:
   ```js
   const node = figma.getNodeById('<frameId>');
   node.fills = [{ type: 'IMAGE', imageHash: '<hash>', scaleMode: 'FILL' }];
   ```
   Verify each fill is applied before moving on.

7. Persist manifest:
   ```bash
   echo '<manifest JSON>' | "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/set-manifest.ts"
   ```
   Where manifest JSON = `{ "pageId": "<id>", "frames": [{ "label": "...", "frameId": "...", "imageHash": "..." }, ...] }`.

8. Regenerate snapshot:
   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/render-snapshot.ts"
   ```

9. Print: `🚀 Pushed to Figma!` + the Figma file URL + prompt to share with reviewers.

10. Mark task `[FIGLOOPS] Push to Figma` as `completed`. Run:
    ```bash
    "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/advance-phase.ts" await-comments
    ```
    Invoke skill `figloops-next-await`.
