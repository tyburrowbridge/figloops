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

2. Run:
   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/upload-images.ts"
   ```
   Parse stdout: `{ round, uploads: [{label, filename, imageHash}], failed: [] }`. If `uploads` is empty, abort and surface the error.

3. Read `figloops.config.json` for `figma.fileKey` and `viewport.width`. Read `feedback/state.json` for `uiTheme` (default `'light'` if absent) and the current round's `captures` array (for route path info).

4. Get a timestamp:
   ```bash
   date '+%-d %B %Y (%-I:%M %p)'
   ```
   Construct page name: `Round <round> — <timestamp>` (em dash).

   Merge the uploads array from step 2 with the captures from `state.json` by matching on `label`, producing `enrichedUploads: Array<{ label, path, imageHash }>`.

   Call MCP **once** to find or create this page in `<fileKey>` and create all frames in a single JS execution. Embed `enrichedUploads`, `pageName`, `viewportWidth`, and `uiTheme` as literals. Capture the returned `frames` array (`[{ label, frameId, imageHash }]`).

   Note: if push is re-run, the new timestamp creates a new page with a slightly different name. The user can delete any orphaned page manually.

   ```js
   // Embed all four as literals
   const enrichedUploads = /* [{label, path, imageHash}] */;
   const pageName = '<Round N — timestamp>';
   const viewportWidth = <width>;
   const uiTheme = '<light|dark>';  // from state.json; default 'light' if missing

   const isDark = uiTheme === 'dark';
   const pageBg   = isDark ? { r: 240/255, g: 240/255, b: 240/255 } : { r: 30/255, g: 30/255, b: 30/255 };
   const labelClr = isDark ? { r: 51/255,  g: 51/255,  b: 51/255  } : { r: 1, g: 1, b: 1 };

   function pathToTitle(path) {
     return path.replace(/^\//, '').split('/').map(seg =>
       seg.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
     ).join(' / ') || 'Home';
   }

   let page = figma.root.children.find(p => p.name === pageName);
   if (!page) { page = figma.createPage(); page.name = pageName; }
   await figma.setCurrentPageAsync(page);
   page.backgrounds = [{ type: 'SOLID', color: pageBg }];

   const groups = new Map();
   for (const u of enrichedUploads) {
     if (!groups.has(u.path)) groups.set(u.path, []);
     groups.get(u.path).push(u);
   }

   await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });

   const GAP_X = 40, GAP_Y = 80, LABEL_HEIGHT = 50, FRAME_HEIGHT = 900;
   let currentY = 0;
   const frames = [];

   for (const [path, items] of groups) {
     const labelNode = figma.createText();
     labelNode.fontName = { family: 'Inter', style: 'Semi Bold' };
     labelNode.fontSize = 24;
     labelNode.characters = pathToTitle(path);
     labelNode.fills = [{ type: 'SOLID', color: labelClr }];
     labelNode.x = 0;
     labelNode.y = currentY;
     page.appendChild(labelNode);
     currentY += LABEL_HEIGHT;

     for (let i = 0; i < items.length; i++) {
       const frame = figma.createFrame();
       frame.name = items[i].label;
       frame.x = i * (viewportWidth + GAP_X);
       frame.y = currentY;
       frame.resize(viewportWidth, FRAME_HEIGHT);
       page.appendChild(frame);
       frames.push({ label: items[i].label, frameId: frame.id, imageHash: items[i].imageHash });
     }
     currentY += FRAME_HEIGHT + GAP_Y;
   }

   return JSON.stringify({ pageId: page.id, frames });
   ```

   Capture `pageId` and `frames` from the return value.

5. **Apply image fills via MCP** in a single JS execution. Pass `frames` (from step 4) as a literal embedded in the snippet. Collect per-frame results.

   ```js
   const frames = /* paste JSON array from step 4 */;
   const results = [];
   for (const { frameId, imageHash } of frames) {
     try {
       const node = figma.getNodeById(frameId);
       if (!node) { results.push({ frameId, ok: false, error: 'node not found' }); continue; }
       node.fills = [{ type: 'IMAGE', imageHash, scaleMode: 'FILL' }];
       results.push({ frameId, ok: true });
     } catch (e) {
       results.push({ frameId, ok: false, error: e.message });
     }
   }
   return JSON.stringify(results);
   ```

   If any result has `ok: false`, surface the errors verbatim. Do not abort — log which frames failed and continue.

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
