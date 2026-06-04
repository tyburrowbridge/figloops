---
name: figloops-next-await
description: figloops await-comments phase handler — polls for Figma comments and gates until at least one arrives
---

## Setup
Resolve `FIGLOOPS_PLUGIN_DIR` from env or `.env`. If unset, abort. Scripts: `cd "<CONSUMING_REPO>" && "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/<name>.ts" <args>`. Always double-quote paths.

## Errors
TS exits non-zero → relay stderr verbatim, don't advance.

---

## Handler

1. Mark `[FIGLOOPS] Wait for user comments` as `in_progress`.

2. Run:
   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/pull-comments.ts"
   ```
   Parse stdout: `{ round, totalComments, forThisRound }`.

3. **If `forThisRound === 0`:** print this as the final output (after all tool calls, so it lands below any task list):
   ```
   ---
   💬 **No comments yet for Round <round>.**

   > ▶ **Re-run `/figloops:next`** once your reviewers have left feedback in Figma.
   ---
   ```
   Do not advance. Do not change task tracker state.

4. **If `forThisRound > 0`:** mark task `[FIGLOOPS] Wait for user comments` as `completed`. Run:
   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/advance-phase.ts" pull
   ```
   Invoke skill `figloops-next-pull`.
