---
name: figloops-next-pull
description: Pull phase — fetch Figma comments and advance
user-invocable: false
---

## Setup
Resolve `FIGLOOPS_PLUGIN_DIR` from env or `.env`. If unset, abort. Scripts: `cd "<CONSUMING_REPO>" && "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/<name>.ts" <args>`. Always double-quote paths.

## Errors
TS exits non-zero → relay stderr verbatim, don't advance.

---

## Handler

1. Mark `[FIGLOOPS] Pull comments` as `in_progress`.

2. Comments are already in `state.json` from the await-comments handler's pull call. No additional fetch needed.

3. Regenerate snapshot:
   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/render-snapshot.ts"
   ```

4. Mark task `[FIGLOOPS] Pull comments` as `completed`. Run:
   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/advance-phase.ts" comment-review
   ```
   Invoke skill `figloops-next-review`.
