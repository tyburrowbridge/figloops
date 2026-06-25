---
name: figloops-discover
description: Auto-detect modal/panel/menu/tab scenarios by crawling the running app
user-invocable: false
---

## Setup
Resolve `FIGLOOPS_PLUGIN_DIR` from env or `.env`. If unset, abort: `"FIGLOOPS_PLUGIN_DIR is not set. Add it to .env or your shell. See README."` Scripts run from the consuming repo: `cd "<CONSUMING_REPO>" && "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/<name>.ts"`. Always double-quote paths.

## Style
Tables for 2+ comparable fields (escape `|` → `\|`, newlines → spaces in cells). `AskUserQuestion` options carry no descriptions.

## Errors
TS exits non-zero → relay stderr verbatim, don't retry. Config load fail → tell the user to run `/figloops:init`.

---

## Handler

1. From `figloops.config.json` read `devServer.url` (→ `baseUrl`), `devServer.waitFor`, `viewport`, and `routes` (`label` + `path` only).

2. Run the crawler — build the payload and pipe it in:
   ```bash
   echo '{"baseUrl":"<url>","viewport":{"width":<w>,"height":<h>},"waitFor":"<waitFor>","routes":[{"label":"...","path":"..."}, …]}' \
     | "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/discover-scenarios.ts"
   ```
   Parse stdout JSON: `{ baseUrl, candidates: [{label, path, setup, waitFor, kind, confidence, triggerText}], skipped: [{path, error}] }`. Progress prints to stderr live.

3. **If `candidates` is empty:** print `"No modal/panel/menu/tab interactions detected. Make sure the dev server is running at <baseUrl>."` If `skipped` is non-empty, list those routes + errors. Stop.

4. Render the candidates table (1-indexed `#`):

   ```
   🔎 Found N interactive scenarios:

   | # | Kind | Label | Path | Trigger | Confidence |
   |---|---|---|---|---|---|
   | 1 | modal | Sign up — modal | / | `#open-signup` | high |
   | 2 | panel | Cart — panel | / | `#open-cart` | medium |
   ```

   `Trigger` = `setup[0]`. If `skipped` is non-empty, append a second table `| Path | Error |`.

5. Ask:
   ```
   question: "Add these scenarios to figloops.config.json?"
   header: "Scenarios"
   options:
     - label: "Add all"
     - label: "Pick some"
     - label: "Cancel"
   ```
   - **Cancel:** print `"Nothing changed."` Stop.
   - **Pick some:** prompt plain text — `"Enter the row numbers to add (comma-separated, e.g. 1,3,4):"`. Keep only those candidates; reject out-of-range numbers and re-prompt.
   - **Add all:** keep every candidate.

6. Build the chosen scenarios as a JSON array of `{label, path, setup, waitFor, kind}` (drop `confidence`/`triggerText` — not part of the config schema) and merge:
   ```bash
   echo '<scenarios JSON>' | "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/merge-scenarios.ts"
   ```
   Parse stdout: `{ added, skipped, total }`. (`skipped` = candidates already present in config.)

7. Print:
   ```
   ✓ Added <added> scenario(s) to figloops.config.json (<skipped> already present, <total> total).
   → Run /figloops:go to capture them in the next round.
   ```
