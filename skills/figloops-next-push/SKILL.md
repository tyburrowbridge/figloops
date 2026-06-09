---
name: figloops-next-push
description: Push phase — upload images and create Figma frames
user-invocable: false
---

## Setup
Resolve `FIGLOOPS_PLUGIN_DIR` from env or `.env`. If unset, abort. Scripts: `cd "<CONSUMING_REPO>" && "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/<name>.ts" <args>`. Always double-quote paths.

## Errors
TS exits non-zero → relay stderr verbatim. MCP fail → relay error, note partial state ("images uploaded but no frames created — delete the Round <N> page if it was created"), don't advance. State load fail → abort.

---

## Handler

1. Mark `[FIGLOOPS] Push to Figma` as `in_progress`.

2. Read `figloops.config.json` for `figma.fileKey` and `viewport.width`. Read `feedback/state.json` for `currentRound`, `uiTheme` (default `'light'`), and current round's `captures` (`[{ label, filename }]`). Resolve captures dir: `feedback/round-<currentRound>/captures/`. If missing or contains no `.png`, `.jpg`, or `.jpeg` files, abort: `✗ No captures found — run /figloops:next from the capture phase first.`

3. Timestamp: `date '+%-d %B %Y (%-I:%M %p)'`. Page name: `Round <round> — <timestamp>` (em dash).

4. Compute SHA-256 for each capture: `shasum -a 256 "<capturesDir>/<filename>" | cut -d' ' -f1`. Read prior round's manifest from `feedback/state.json` at `rounds[<currentRound-1>].pushManifest.frames[]` if exists; build a `{label → imageHash}` map for reuse.

   Note: embed only `label` and `filename` strings from `captures[]` — never image bytes.

   Call MCP **once** to find/create the page in `<fileKey>` and create all frames in a single JS execution. Embed `captures`, `pageName`, `viewportWidth`, and `uiTheme` as literals.

   ```js
   const captures = /* [{label, filename}] from state.json */;
   const pageName = '<Round N — timestamp>';
   const viewportWidth = <width>;
   const uiTheme = 'light'; // substitute 'light'|'dark' from state.json

   const isDark = uiTheme === 'dark';
   const pageBg   = isDark ? { r: 240/255, g: 240/255, b: 240/255 } : { r: 30/255, g: 30/255, b: 30/255 };
   const labelClr = isDark ? { r: 51/255,  g: 51/255,  b: 51/255  } : { r: 1, g: 1, b: 1 };

   function pathToTitle(filename) {
     const stem = filename.replace(/\.(png|jpe?g|webp)$/i, '').replace(/^\d+-/, '');
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
   page.backgrounds = [{ type: 'SOLID', color: pageBg, opacity: 1, visible: true, blendMode: 'NORMAL' }];

   await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });

   const GAP_Y = 80, LABEL_HEIGHT = 50, FRAME_HEIGHT = 900;
   let currentY = 0;
   const frames = [];

   for (const capture of captures) {
     const labelNode = figma.createText();
     labelNode.fontName = { family: 'Inter', style: 'Semi Bold' };
     labelNode.fontSize = 24;
     labelNode.characters = pathToTitle(capture.filename);
     labelNode.fills = [{ type: 'SOLID', color: labelClr, opacity: 1, visible: true, blendMode: 'NORMAL' }];
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

5. **Upload images (parallel)** — partition `frames` into `reuse` (hash matches prior round's frame with same label) and `upload`.

   a. For each `upload` frame, call MCP `upload_assets` with `count=1`, `nodeId=<frameId>`, `fileKey=<fileKey>`. Collect `{frameId, filename, uploadUrl, commitUrl?}` pairs. (One MCP call per frame is required because `nodeId` only works with `count=1`.)

   b. Derive Content-Type from extension: `.png` → `image/png`; `.jpg`/`.jpeg` → `image/jpeg`; `.webp` → `image/webp`.

   c. Fire all curls **in parallel** in one bash block. Echo progress per completion so the user sees uploads finish live:
      ```bash
      N=<count>
      ( curl -s -X POST -H "Content-Type: <type1>" --data-binary @"<capturesDir>/<f1>" "<url1>" \
        && echo "[push] ✓ <f1>" >&2 || echo "[push] ✗ <f1>" >&2 ) &
      ( curl -s -X POST -H "Content-Type: <type2>" --data-binary @"<capturesDir>/<f2>" "<url2>" \
        && echo "[push] ✓ <f2>" >&2 || echo "[push] ✗ <f2>" >&2 ) &
      # ... one per upload frame
      wait
      echo "[push] all $N uploads complete" >&2
      ```

   d. After `wait`, POST any returned `commitUrl`s once each: `curl -s -X POST "<commitUrl>"`.

   e. For `reuse` frames, make ONE `use_figma` call that loops them and sets `fills` on each `frameId` to `[{ type: 'IMAGE', scaleMode: 'FILL', imageHash: '<prior hash>' }]`.

   On any upload failure, surface the error verbatim and continue with remaining frames — do not abort.

6. Persist manifest:
   ```bash
   echo '<manifest JSON>' | "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/set-manifest.ts"
   ```
   Manifest JSON: `{ "pageId": "<id>", "frames": [{ "label": "...", "frameId": "...", "imageHash": "..." }, ...] }`. Use the SHA-256 from step 4 as `imageHash` (for reused frames, carry forward the prior hash).

7. Regenerate snapshot: `"<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/render-snapshot.ts"`

8. Print: `🚀 Pushed to Figma!` + the Figma file URL + prompt to share with reviewers.

9. Mark `[FIGLOOPS] Push to Figma` as `completed`. Run:
   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/advance-phase.ts" await-comments
   ```
   Invoke skill `figloops-next-await`.
