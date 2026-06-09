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

2. Read `feedback/state.json` and `figloops.config.json` (for `figma.fileKey`). Sort comments by `frameLabel` (insertion order of first appearance) then by insertion order within a frame. Assign a per-round global sequence number (`#` column: 1, 2, 3, … continuous across all frames — do not reset per frame).

   Render a **single** table with columns `# | 🖼️ Frame | 👤 User | 💬 Comment | 🔗 Link`. The Figma comment ID stays in state for traceability but is not surfaced as a column.

   **Link construction (per row):**
   - Encode the comment's `nodeId` with `:` → `%3A` (e.g. `12:345` → `12%3A345`).
   - URL: `https://www.figma.com/design/<fileKey>/?node-id=<encodedNodeId>#<commentId>`
   - Markdown: `[View](<url>)`
   - If `nodeId` is null, render `—` (no link).

   ```
   🔍 Round <round> — Comments to review (<N> total)

   | # | 🖼️ Frame      | 👤 User    | 💬 Comment                                   | 🔗 Link |
   |---|---------------|------------|----------------------------------------------|---------|
   | 1 | 01 - Login    | Sarah Lee  | The CTA below the form is hard to find.      | [View](https://www.figma.com/design/<fileKey>/?node-id=12%3A345#1234567890_1) |
   | 2 | 01 - Login    | Mike Chen  | Form copy is unclear; add helper text.       | [View](https://www.figma.com/design/<fileKey>/?node-id=12%3A345#1234567890_2) |
   | 3 | 02 - Dashboard | Sarah Lee | Nav doesn't show what's active.              | [View](https://www.figma.com/design/<fileKey>/?node-id=12%3A678#1234567890_3) |

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
