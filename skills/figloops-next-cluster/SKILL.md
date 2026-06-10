---
name: figloops-next-cluster
description: Cluster phase — group comments into themes and draft plan
user-invocable: false
---

## Setup
Resolve `FIGLOOPS_PLUGIN_DIR` from env or `.env`. If unset, abort. Scripts: `cd "<CONSUMING_REPO>" && "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/<name>.ts" <args>`. Always double-quote paths.

## Errors
TS exits non-zero → relay stderr verbatim, don't advance.

---

## Handler

1. Mark `[FIGLOOPS] Cluster themes` as `in_progress`.

2. Read `feedback/state.json`. Cluster the current round's comments by inferred semantic theme — **not** by frame or by author. One theme may span multiple frames.

3. Build the `themes` array and a proposed `plan` array. Each plan item:
   - `id`: `p1`, `p2`, `p3`, … in order
   - `themeName`: matches one of the themes
   - `change`: a concrete proposed change (specific and actionable)
   - `drivesFrom`: array of comment IDs from state
   - `status`: `"pending"`

4. Write themes and plan:
   ```bash
   echo '<THEMES_JSON>' | "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/set-themes.ts"
   echo '{"action":"set","items":[...]}' | "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/update-plan.ts"
   ```
   `THEMES_JSON` = array of `{ name, commentIds, summary }`. Plan items array = `{ id, themeName, change, drivesFrom, status: "pending" }`.

5. Regenerate snapshot:
   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/render-snapshot.ts"
   ```

6. Mark task `[FIGLOOPS] Cluster themes` as `completed`. Run:
   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/advance-phase.ts" plan-ack
   ```
   Invoke skill `figloops-next-plan-ack`.
