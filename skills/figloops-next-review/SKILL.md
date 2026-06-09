---
name: figloops-next-review
description: Review phase — display comments by frame; gate on user decision
user-invocable: false
---

## Setup
Resolve `FIGLOOPS_PLUGIN_DIR` from env or `.env`. If unset, abort. Scripts: `cd "<CONSUMING_REPO>" && "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/<name>.ts" <args>`. Always double-quote paths.

## Style
Tables for comment display (escape `|` → `\|`, newlines → spaces in cells). `AskUserQuestion` options carry no descriptions.

## Errors
TS exits non-zero → relay stderr verbatim, don't advance.

---

## Handler

1. Mark `[FIGLOOPS] Review comments` as `in_progress`.

2. Read `feedback/state.json`. Group comments by `frameLabel`. Assign a per-round global sequence number (`#` column: 1, 2, 3, … continuous across all frames in the round — do not reset per frame). The Figma comment ID stays in state for traceability but is not surfaced here.

   Render a sub-table per frame. Frame groups appear in first-comment-insertion order; comments within a frame keep insertion order.

   ```
   🔍 Round <round> — Comments to review (<N> total)

   #### Frame: 01 - Login

   | # | Author | Comment |
   |---|---|---|
   | 1 | Sarah Lee | The CTA below the form is hard to find. |
   | 2 | Mike Chen | Form copy is unclear; add helper text. |

   #### Frame: 02 - Dashboard

   | # | Author | Comment |
   |---|---|---|
   | 3 | Sarah Lee | Nav doesn't show what's active. |

   Your Figma file: <URL>
   ```

3. Use `AskUserQuestion`:
   ```
   question: "How do you want to proceed with these comments?"
   header: "Review comments"
   options:
     - label: "Continue to clustering  (Recommended)"
     - label: "Pull again"
     - label: "Cancel round"
   ```

4. **On "Continue to clustering":** mark task `completed`. Run:
   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/advance-phase.ts" cluster
   ```
   Invoke skill `figloops-next-cluster`.

5. **On "Pull again":** re-run `pull-comments.ts`, re-render the comment list, ask again with the same 3 options.

6. **On "Cancel round":** run:
   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/advance-phase.ts" await-comments
   ```
   Stop.
