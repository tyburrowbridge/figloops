---
name: figloops-go-push
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

2. Read `figloops.config.json` for `figma.fileKey` and `viewport.width`. Read `feedback/state.json` for `currentRound`, `uiTheme` (default `'light'`), and current round's `captures` (`[{ label, filename }]`). Resolve captures dir: `feedback/round-<currentRound>/captures/`. If missing or contains no `.png`, `.jpg`, or `.jpeg` files, abort: `✗ No captures found — run /figloops:go from the capture phase first.`

3. Timestamp: `"<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/timestamp.ts" page` (e.g. `24 June 2026 (3:45 PM)`). Page name: `Round <round> — <timestamp>` (em dash).

4. Compute SHA-256 for every capture in one call: `"<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/hash-captures.ts" "<capturesDir>"` → returns `{ "<filename>": "<sha256>", … }`. Read prior round's manifest from `feedback/state.json` at `rounds[<currentRound-1>].pushManifest.frames[]` if exists; build a `{label → imageHash}` map for reuse.

   Note: embed only `label` and `filename` strings from `captures[]` — never image bytes.

   Call MCP **once** to find/create the page in `<fileKey>` and create all frames in a single JS execution. Embed `captures`, `pageName`, `viewportWidth`, `pageBg`, and `labelClr` as literals.

   **Resolve bg/label colors BEFORE building the JS** (do not branch inside the JS — agents sometimes substitute the wrong literal):
   - Read `uiTheme` from `feedback/state.json`. If missing, default `'light'`.
   - Intent: app theme and canvas bg are **opposite** for contrast.
     - `uiTheme === 'light'` → `pageBg = { r: 30/255,  g: 30/255,  b: 30/255  }` (dark canvas `#1E1E1E`), `labelClr = { r: 1, g: 1, b: 1 }` (white text)
     - `uiTheme === 'dark'`  → `pageBg = { r: 240/255, g: 240/255, b: 240/255 }` (light canvas `#F0F0F0`), `labelClr = { r: 51/255, g: 51/255, b: 51/255 }` (near-black text)
   - Inline both as object literals in the JS below. Do NOT include the `uiTheme` variable or any ternary in the embedded script.

   ```js
   const captures = /* [{label, filename}] from state.json */;
   const pageName = '<Round N — timestamp>';
   const viewportWidth = <width>;
   const pageBg   = /* resolved literal, e.g. { r: 30/255, g: 30/255, b: 30/255 } */;
   const labelClr = /* resolved literal, e.g. { r: 1, g: 1, b: 1 } */;

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
   // Always overwrite — Figma's default page bg is ~#F0F0F0; reused pages may keep stale bg.
   page.backgrounds = [{ type: 'SOLID', color: pageBg, opacity: 1, visible: true, blendMode: 'NORMAL' }];
   const appliedBg = page.backgrounds[0].color; // include in return for verification

   await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });

   const GAP_Y = 80, LABEL_HEIGHT = 50, LABEL_GAP = 32, FRAME_HEIGHT = 900;
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
     // Clear Figma's frame-name strip (renders just above the frame top).
     currentY += LABEL_HEIGHT + LABEL_GAP;

     const frame = figma.createFrame();
     frame.name = capture.label;
     frame.x = 0;
     frame.y = currentY;
     frame.resize(viewportWidth, FRAME_HEIGHT);
     page.appendChild(frame);
     frames.push({ label: capture.label, filename: capture.filename, frameId: frame.id });
     currentY += FRAME_HEIGHT + GAP_Y;
   }

   return JSON.stringify({ pageId: page.id, appliedBg, frames });
   ```

   Capture `pageId`, `appliedBg`, and `frames` from the return value. Verify `appliedBg` matches the `pageBg` you embedded (component-wise within 1/255). If it doesn't, abort and surface the mismatch — do not proceed to uploads.

5. **Upload images (parallel)** — partition `frames` into `reuse` (hash matches prior round's frame with same label) and `upload`.

   a. For each `upload` frame, call MCP `upload_assets` with `count=1`, `nodeId=<frameId>`, `fileKey=<fileKey>`. Collect `{frameId, filename, uploadUrl, commitUrl?}` pairs. (One MCP call per frame is required because `nodeId` only works with `count=1`.)

   b. Upload all bytes and commit in one call — build a JSON array and pipe it to `upload-to-urls.ts` (uploads run with bounded concurrency; commit URLs POST after; per-file progress prints to stderr live). Content-Type is derived from each file's extension by the script:
      ```bash
      echo '[{"file":"<capturesDir>/<f1>","uploadUrl":"<url1>","commitUrl":"<commitUrl1>"}, …]' \
        | "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/upload-to-urls.ts"
      ```
      Omit `commitUrl` for items that didn't return one. The script returns `{ uploaded, failed, commitFailed }`. Surface any `failed` entries verbatim and continue — do not abort. A non-empty `commitFailed` exits non-zero (an uploaded blob never finalized → blank frame): relay it verbatim and stop; do not advance the phase.

   d. For `reuse` frames, make ONE `use_figma` call that loops them and sets `fills` on each `frameId` to `[{ type: 'IMAGE', scaleMode: 'FILL', imageHash: '<prior hash>' }]`.

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
   Invoke skill `figloops-go-await`.
