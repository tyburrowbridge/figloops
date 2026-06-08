---
name: figloops-next-plan
description: Plan phase — present proposed changes; gate on approval
---

## Setup
Resolve `FIGLOOPS_PLUGIN_DIR` from env or `.env`. If unset, abort. Scripts: `cd "<CONSUMING_REPO>" && "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/<name>.ts" <args>`. Always double-quote paths.

## Style
Tables for plan display (escape `|` → `\|`, newlines → spaces in cells). `AskUserQuestion` options carry no descriptions.

## Errors
TS exits non-zero → relay stderr verbatim, don't advance.

---

## Handler

1. Mark `[FIGLOOPS] Approve plan` as `in_progress`.

2. Read `feedback/state.json`. Render a table per theme. Use global item numbering (continuous across all themes for the `#` column):

   ```
   📋 Round <round> — Plan approval

   ### Theme: Navigation clarity

   | # | Change | Drives from |
   |---|---|---|
   | 1 | Add breadcrumbs to Dashboard | Sarah Lee (#12), Mike Chen (#17) |
   | 2 | Highlight active nav item | Sarah Lee (#23) |

   ### Theme: Color contrast

   | # | Change | Drives from |
   |---|---|---|
   | 3 | Increase contrast on secondary buttons | Anita Roy (#41), Mike Chen (#44) |
   ```

3. Use `AskUserQuestion`:
   ```
   question: "How do you want to handle this plan?"
   header: "Approve plan"
   options:
     - label: "Approve all"
     - label: "Approve some only"
     - label: "Edit one"
     - label: "Reject all"
   ```

4. Apply the choice:

   - **"Approve all"**: build payload with every item `→ approved`. Go to step 5.

   - **"Approve some only"**: use **paginated multi-select** (below) over plan items. Selected items `→ approved`; rest `→ rejected`. Go to step 5.

   - **"Edit one"**: use **paginated single-select** (below) to pick the item. Prompt plain text: `"New change text for item <N>?"`. Pipe an updated `set` payload to `update-plan.ts`. Regenerate snapshot. Re-render the plan table. Ask again with the same 4 top-level options.

   - **"Reject all"**: build payload with every item `→ rejected`. Go to step 5.

5. Apply via:
   ```bash
   echo '<payload>' | "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/update-plan.ts"
   ```
   Regenerate snapshot.

6. If any items are `approved`: mark task `completed`. Run `advance-phase.ts implement`. Invoke skill `figloops-next-implement`.

7. If "Reject all": mark task `completed`. Run `advance-phase.ts close`. Invoke skill `figloops-next-close`.

---

## Paginated multi-select

Use when picking **zero or more** items from a list.

1. Chunk the list into pages of 4, preserving order. For each page call `AskUserQuestion` with `multiSelect: true`:
   - `question`: `"Select items to <verb> — page <i> of <total>"` (omit page suffix if only 1 page).
   - One option per item: `label: "<N>. <change truncated to ~60 chars>"`.
   - Zero selections per page is allowed — the user may want nothing from this page.
2. Accumulate selections across all pages.
3. **Recap + confirm** (always — even on single-page flows):

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
   - Submit: apply the selections.
   - Start over: clear, restart from page 1.
   - Cancel: re-ask the gate's top-level question (step 3 above).

4. If zero total selections at recap: print `"No items selected — returning to the top menu."` and re-ask the top-level question.

---

## Paginated single-select

Use when picking **exactly one** item.

1. Chunk the list into pages of 3, reserving the 4th slot for a next-page sentinel.
2. For each page (except the last), call `AskUserQuestion` with:
   - One option per item: `label: "<N>. <change truncated>"`.
   - A 4th option: `label: "Show next page →"`.
3. If the user picks `"Show next page →"`, advance to the next page.
4. If the user picks an item, show **recap + confirm**:

   Print: `"You picked: <N>. <change text>"`

   Then `AskUserQuestion`:
   ```
   question: "Submit this choice?"
   header: "Confirm"
   options:
     - label: "Submit  (Recommended)"
     - label: "Pick a different item"
     - label: "Cancel"
   ```
   - Submit: return the picked item.
   - Pick a different item: restart from page 1.
   - Cancel: re-ask the gate's top-level question.

5. The last page has no `"Show next page →"` sentinel — the user must pick an item there.
