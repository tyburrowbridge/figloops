---
name: figloops-next-implement
description: figloops implement phase handler — tracks shipping of approved plan items with optional git branch
---

## Setup
Resolve `FIGLOOPS_PLUGIN_DIR` from env or `.env`. If unset, abort. Scripts: `cd "<CONSUMING_REPO>" && "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/<name>.ts" <args>`. Always double-quote paths.

## Style
Tables for item list (escape `|` → `\|`, newlines → spaces). `AskUserQuestion` options carry no descriptions.

## Errors
TS exits non-zero → relay stderr verbatim, don't advance.

---

## Handler

1. Mark `[FIGLOOPS] Implement changes` as `in_progress`.

2. **Git branch handling.** Skip this step if `state.rounds[currentRound].git?.branch` is already set.

   Read `git.branchPerRound` from `figloops.config.json` (default `"always"` if the `git` block is absent and the cwd is a git repo). Check git status:
   ```bash
   git rev-parse --is-inside-work-tree 2>/dev/null
   ```
   If exits non-zero or prints anything other than `true`: skip to step 3.

   **If `"never"`:** skip to step 3.

   **If `"ask"`:** use `AskUserQuestion`:
   ```
   question: "Create a branch for Round <round>'s implementation?"
   header: "Git branch"
   options:
     - label: "Yes — create figloops/round-<round>-<YYYY-MM-DD>  (Recommended)"
     - label: "No — stay on current branch"
     - label: "Never ask again (sets git.branchPerRound: never)"
   ```
   - Yes: continue to branch creation below.
   - No: skip to step 3.
   - Never ask again: edit `figloops.config.json` to set `"git": { "branchPerRound": "never" }`. Skip to step 3.

   **If `"always"` or user chose "Yes":** check for uncommitted changes:
   ```bash
   git status --porcelain
   ```
   If non-empty: abort with `"Uncommitted changes detected. Commit or stash them before figloops creates a new branch, then re-run /figloops:next."` Do not advance state.

   Compute branch name using `date '+%Y-%m-%d'`. Base: `figloops/round-<round>-<YYYY-MM-DD>`. If `git rev-parse --verify <name>` exits 0 (branch exists), append `-2`, `-3`, etc. until unique.

   Capture the current branch BEFORE checkout: `git rev-parse --abbrev-ref HEAD`. Then:
   ```bash
   git checkout -b <branch-name>
   ```
   Tell user: `"Switched to \`<branch-name>\` (from \`<previous-branch>\`). Implementation work for this round will live here."`

   Persist to state under the current round (read state.json, set the field, write it back):
   ```json
   "git": { "branch": "<branch-name>", "baseBranch": "<previous-branch>" }
   ```

3. Read state. List approved plan items as a status table:
   ```
   🛠️ Round <round> — Implementing (<shipped> of <approved> shipped)

   | # | Status | Change |
   |---|---|---|
   | 1 | ✓ shipped | Add breadcrumbs to Dashboard |
   | 2 | — pending | Highlight active nav item |
   | 3 | — pending | Increase contrast on secondary buttons |
   ```

4. Use `AskUserQuestion`:
   ```
   question: "What's your next move?"
   header: "Implement"
   options:
     - label: "Mark items as shipped"
     - label: "Close round"
   ```

5. Apply the choice:

   - **"Mark items as shipped":** compute `notYetShipped` = approved items whose status is not `shipped`. Use **paginated multi-select** (below) over `notYetShipped`. Build a status-update payload marking selected items `→ shipped`. Apply via `update-plan.ts`. Regenerate snapshot. Re-render the list. If all approved items are now `shipped`, auto-advance to close. Otherwise ask again with the same 2 top-level options.

   - **"Close round":** build payload marking all remaining `approved` items `→ dropped`. Apply via `update-plan.ts`. Advance: run `advance-phase.ts close`. Invoke skill `figloops-next-close`.

6. When all approved items are `shipped`: run `advance-phase.ts close`. Invoke skill `figloops-next-close`.

---

## Paginated multi-select

Use when picking **zero or more** items from a list.

1. Chunk the list into pages of 4, preserving order. For each page call `AskUserQuestion` with `multiSelect: true`:
   - `question`: `"Select items to <verb> — page <i> of <total>"` (omit page suffix if only 1 page).
   - One option per item: `label: "<N>. <change truncated to ~60 chars>"`.
   - Zero selections per page is allowed.
2. Accumulate selections across all pages.
3. **Recap + confirm** (always):

   Print:
   ```
   Selected to <verb> (N):

   | # | Change |
   |---|---|
   | 1 | <change text> |

   NOT <verbed> (M):

   | # | Change |
   |---|---|
   | 2 | <change text> |
   ```

   Then `AskUserQuestion`:
   ```
   question: "Submit these selections?"
   header: "Confirm"
   options:
     - label: "Submit  (Recommended)"
     - label: "Start over"
     - label: "Cancel"
   ```
   - Submit: apply. Start over: clear, restart page 1. Cancel: re-ask the top-level question (step 4 above).

4. If zero total selections at recap: print `"No items selected — returning to the top menu."` and re-ask.
