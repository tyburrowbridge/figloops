---
name: figloops-next-capture
description: Capture phase — Playwright screenshots + preview gate
---

## Setup
Resolve `FIGLOOPS_PLUGIN_DIR` from env or `.env`. If unset, abort: `"FIGLOOPS_PLUGIN_DIR is not set. Add it to .env or your shell. See README."` Scripts: `cd "<CONSUMING_REPO>" && "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/<name>.ts" <args>`. Always double-quote paths.

## Style
Tables for 2+ comparable fields (escape `|` → `\|`, newlines → spaces in cells). `AskUserQuestion` options carry no descriptions.

## Errors
TS exits non-zero → relay stderr verbatim, don't retry. State load fail → abort + tell user to restore backup and re-run `/figloops:init`.

---

## Handler

1. Mark task `[FIGLOOPS] Capture screenshots` as `in_progress` via `TaskUpdate`.

2. Run:
   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/capture.ts"
   ```
   Parse stdout JSON: `{ round, captures: [{label, path, filename}], failed: [] }`.

3. Regenerate snapshot:
   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/render-snapshot.ts"
   ```

4. **Preview gate.** Print a markdown table — one row per capture:

   ```
   📸 Captured N items for Round <round>:

   | # | Filename | Source | Figma frame |
   |---|---|---|---|
   | 01 | `01-login.png` | route | "01 - Login" |
   | 02 | `02-sign-up-modal.png` | scenario | "02 - Sign up modal" |

   Expected Figma layout on page "Round <round>": 3 columns wide, rows added as needed.
   ```

   Columns: `#` (2-digit, 1-indexed), `Filename`, `Source` (`route` or `scenario`), `Figma frame` (the frame name it will become). If `failed` is non-empty, append a second table:

   ```
   Failed (N):

   | Label | Error |
   |---|---|
   | Old checkout | net::ERR_ABORTED at /old-checkout |
   ```

   Then use `AskUserQuestion`:
   ```
   question: "Do these captures look right?"
   header: "Preview"
   options:
     - label: "Approve — push to Figma  (Recommended)"
     - label: "Re-capture"
     - label: "Cancel"
   ```

5. **On "Approve — push to Figma":** mark task `[FIGLOOPS] Capture screenshots` as `completed`. Run:
   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/advance-phase.ts" push
   ```
   Then invoke skill `figloops-next-push`.

6. **On "Re-capture":** re-run step 2.

7. **On "Cancel":** stop here. Do not advance state.
