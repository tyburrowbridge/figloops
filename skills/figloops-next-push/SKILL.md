---
name: figloops-next-push
description: Push phase — upload images and create Figma frames
---

## Setup
Resolve `FIGLOOPS_PLUGIN_DIR` from env or `.env`. If unset, abort. Scripts: `cd "<CONSUMING_REPO>" && "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/<name>.ts" <args>`. Always double-quote paths.

## Errors
TS exits non-zero → relay stderr verbatim. MCP fail → relay error, note partial state ("images uploaded but no frames created — delete the Round <N> page if it was created"), don't advance. State load fail → abort.

---

## Handler

1. Mark `[FIGLOOPS] Push to Figma` as `in_progress`.

2. Read `figloops.config.json` for `figma.fileKey` and `viewport.width`. Read `feedback/state.json` for `currentRound`, `uiTheme` (default `'light'` if absent), and the current round's `captures` array (`[{ label, filename }]`).

   Resolve captures directory: `feedback/round-<currentRound>/captures/`. If it doesn't exist or contains no `.png` files, abort: `✗ No captures found — run /figloops:next from the capture phase first.`

3. Get a timestamp:
   ```bash
   date '+%-d %B %Y (%-I:%M %p)'
   ```
   Construct page name: `Round <round> — <timestamp>` (em dash).

4. Call MCP **once** to find or create this page in `<fileKey>` and create all frames in a single JS execution. Embed `captures`, `pageName`, `viewportWidth`, and `uiTheme` as literals. Capture the returned `frames` array (`[{ label, filename, frameId }]`).

   ```js
   const captures = /* [{label, filename}] from state.json */;
   const pageName = '<Round N — timestamp>';
   const viewportWidth = <width>;
   const uiTheme = '<light|dark>';

   const isDark = uiTheme === 'dark';
   const pageBg   = isDark ? { r: 240/255, g: 240/255, b: 240/255 } : { r: 30/255, g: 30/255, b: 30/255 };
   const labelClr = isDark ? { r: 51/255,  g: 51/255,  b: 51/255  } : { r: 1, g: 1, b: 1 };

   function pathToTitle(filename) {
     const stem = filename.replace(/\.png$/i, '').replace(/^\d+-/, '');
     return stem.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
   }

   let page = figma.root.children.find(p => p.name === pageName);
   if (!page) {
     const blankPage1 = figma.root.children.find(
       p => p.name === 'Page 1' && p.children.length === 0
     );
     if (blankPage1) { page = blankPage1; page.name = pageName; }
     else { page = figma.createPage(); page.name = pageName; }
   }
   await figma.setCurrentPageAsync(page);
   page.backgrounds = [{ type: 'SOLID', color: pageBg, opacity: 1 }];

   await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });

   const GAP_Y = 80, LABEL_HEIGHT = 50, FRAME_HEIGHT = 900;
   let currentY = 0;
   const frames = [];

   for (const capture of captures) {
     const labelNode = figma.createText();
     labelNode.fontName = { family: 'Inter', style: 'Semi Bold' };
     labelNode.fontSize = 24;
     labelNode.characters = pathToTitle(capture.filename);
     labelNode.fills = [{ type: 'SOLID', color: labelClr }];
     labelNode.x = 0;
     labelNode.y = currentY;
     page.appendChild(labelNode);
     currentY += LABEL_HEIGHT;

     const frame = figma.createFrame();
     frame.name = capture.label;
     frame.x = 0;
     frame.y = currentY;
     frame.resize(viewportWidth, FRAME_HEIGHT);
     page.appendChild(frame);
     frames.push({ label: capture.label, filename: capture.filename, frameId: frame.id });
     currentY += FRAME_HEIGHT + GAP_Y;
   }

   return JSON.stringify({ pageId: page.id, frames });
   ```

   Capture `pageId` and `frames` from the return value.

5. **Upload images and apply fills** — for each entry in `frames`:

   a. Call MCP `upload_assets` with `count=1`, `nodeId=<frameId>`, and `fileKey=<fileKey>`. Returns a single-use `uploadUrls[0]` (and optionally `commitUrl` if batch commit is required).

   b. POST the PNG bytes to the upload URL:
      ```bash
      curl -s -X POST \
        -H "Content-Type: image/png" \
        --data-binary @"<capturesDir>/<filename>" \
        "<uploadUrl>"
      ```

   c. If `commitUrl` was returned, call it once after all uploads:
      ```bash
      curl -s -X POST "<commitUrl>"
      ```

   The fill is applied to the frame automatically by Figma upon commit. If any upload fails, surface the error verbatim and continue with remaining frames — do not abort the entire push for a single failure.

6. Persist manifest:
   ```bash
   echo '<manifest JSON>' | "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/set-manifest.ts"
   ```
   Where manifest JSON = `{ "pageId": "<id>", "frames": [{ "label": "...", "frameId": "..." }, ...] }`.

7. Regenerate snapshot:
   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/render-snapshot.ts"
   ```

8. Print: `🚀 Pushed to Figma!` + the Figma file URL + prompt to share with reviewers.

9. Mark task `[FIGLOOPS] Push to Figma` as `completed`. Run:
   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/advance-phase.ts" await-comments
   ```
   Invoke skill `figloops-next-await`.
