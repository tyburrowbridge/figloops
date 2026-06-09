# figloops: Plan-Ack Refactor

**Date:** 2026-06-09
**Status:** Design
**Supersedes:** Sections "Phase 7 — plan-approval" and "Phase 8 — implement" of `2026-05-20-figloops-v1-design.md`

## Problem

The current round flow has two terminal gates that together form a heavyweight, terminal-bound interaction for what is conceptually one task: "tell me which proposed changes you actually want, and which of those you've actually shipped."

- **Phase 7 (plan-approval):** AskUserQuestion with 4 top-level options, paginated multi-select with recap+confirm, optional plain-text edit, regenerate snapshot.
- **Phase 8 (implement):** AskUserQuestion with 2 top-level options, paginated multi-select with recap+confirm.

Both phases live in the terminal. Both render redundant tables. Both gate on click-fatigue prompts. Neither writes code — both are pure state tracking — yet they consume the most user attention in the round.

The rest of figloops uses Figma as the human-input surface (comments on screenshots are the canonical feedback channel). The plan/implement phases break that pattern by pulling the user back into the terminal.

## Goal

Collapse plan-approval and implement into a single Figma-side surface (plan frame + comment threads) plus a single thin terminal refresh step. Use Figma's native comment-thread resolution as the primary "shipped" signal. Keep `feedback/state.json` as the source of truth, with Figma as the input channel.

## Non-goals

- Programmatic comment resolution from the plugin (Figma REST does not expose this; humans resolve)
- Theme re-clustering during the plan-ack phase (feedback comments and plan-discussion comments are different surfaces)
- Mid-round plan additions via slash commands (`/add`) — deferred to a future iteration based on usage
- Inline plan-item edits via slash commands (`/edit`) — deferred; users can edit text directly in the Figma frame and the close phase will reconcile
- Multi-file or multi-page plans
- State migration tooling beyond a one-shot transformer (figloops is early-release)

## High-level flow

1. `cluster` phase emits plan items as today, but writes them with status `pending` (not `proposed`).
2. New phase **`plan-ack`** runs immediately after `cluster`:
   - Render a static Figma frame on the round's page containing one row per plan item (`#`, change text, source theme).
   - For each item, POST a Figma comment anchored to that row via REST. Store the `commentId` per item.
   - Post a bot-reminder reply in each thread describing the interaction model.
   - Persist `planFrameId` and per-item `commentId` + `botReplyId` to state. Exit.
3. User works in Figma: resolves threads (✓) for shipped items, replies `/skip` for won't-do items.
4. User runs `/figloops:next` to refresh:
   - Pull thread states via REST for all stored `commentId`s.
   - Parse: latest reply matching `^/skip\b` wins → `wontdo`. Else `resolved_at != null` → `shipped`. Else → `pending`.
   - Print delta (newly shipped, newly skipped, still pending).
   - If any item is still `pending`, stay on `plan-ack` and exit.
   - If all items are `shipped` or `wontdo`, advance to `close`.
5. `close` phase runs as today (format changelog, post to Figma, bump round) plus cleanup: DELETE all stored `botReplyId`s.

The user touches the terminal exactly twice per round for this work: once to trigger `:next` after cluster (auto-advances through plan-ack render), and once (or more) to refresh and/or advance to close. All decisions happen in Figma.

## Interaction model (Figma side)

| Action in Figma | Item status |
|---|---|
| Resolve thread (click ✓) | `shipped` |
| Reply `/skip` (case-insensitive, must match `^/skip\b`) | `wontdo` |
| Both: reply `/skip` AND resolve | `wontdo` (reply wins) |
| Open thread, no `/skip` reply | `pending` |
| Reply with other text (questions, discussion) | `pending` (parser ignores non-action replies) |
| Delete thread | `removed` (orphaned; surfaced in snapshot, not recreated) |

The bot reminder posted in each thread:

```
🤖 Resolve thread (✓) = shipped · Reply `/skip` = won't do · Other replies = discussion
```

## State schema changes

Bump `schemaVersion` from `1` to `2`. A one-shot migration script reshapes existing state files (see "Migration" below).

### `phaseSchema`

- Remove: `plan-approval`, `implement`
- Add: `plan-ack`

Final enum: `['capture', 'push', 'await-comments', 'pull', 'comment-review', 'cluster', 'plan-ack', 'close']` (8 values).

### `planStatusSchema`

- Remove: `proposed`, `approved`, `rejected`, `dropped`
- Add: `pending`, `wontdo`, `removed`
- Keep: `shipped`

Final enum: `['pending', 'shipped', 'wontdo', 'removed']` (4 values).

Semantic mapping during migration:
- `proposed` → `pending`
- `approved` → `pending` (must be re-acked under the new model)
- `rejected` → `wontdo`
- `dropped` → `wontdo`
- `shipped` → `shipped`

### `planItemSchema`

Add three optional fields. They are populated only after `plan-ack` renders the frame and threads. They remain unset in the `cluster` output.

```ts
const planItemSchema = z.object({
  id: z.string().min(1),
  themeName: z.string().min(1),
  change: z.string().min(1),
  drivesFrom: z.array(z.string()),
  status: planStatusSchema,
  // New in v2:
  commentId: z.string().min(1).optional(),
  botReplyId: z.string().min(1).optional(),
  rowIndex: z.number().int().nonnegative().optional(),
});
```

`rowIndex` records the item's position in the rendered frame, used to recompute anchor coordinates on re-render.

### `roundDataSchema`

Add an optional `planFrame` block, populated only after `plan-ack` renders.

```ts
const planFrameSchema = z.object({
  pageId: z.string().min(1),
  frameId: z.string().min(1),
  frameName: z.string().min(1),
});

const roundDataSchema = z.object({
  // ... existing fields ...
  planFrame: planFrameSchema.optional(),
});
```

## Scripts

### New

| Script | Responsibility |
|---|---|
| `render-plan-frame.ts` | Build the plan frame in Figma via `use_figma`/MCP. One title row, one row per item. Static text. Returns `{pageId, frameId, frameName, rowCoords: [{itemId, x, y}]}`. |
| `anchor-plan-threads.ts` | For each item: POST `/v1/files/:key/comments` at `(x, y)` on `pageId`. POST a bot reminder reply with `comment_id = parent.id`. Write `commentId`, `botReplyId`, `rowIndex` to state per item. |
| `pull-plan-states.ts` | GET `/v1/files/:key/comments`. For each item's `commentId`, walk replies newest→oldest. Apply parse rule (see "Interaction model"). Return `{itemId → status}` and a delta vs prior state. |
| `cleanup-bot-replies.ts` | DELETE every `botReplyId` for the closing round via REST. Tolerates 404 (already deleted by user). |

### Modified

| Script | Change |
|---|---|
| `update-plan.ts` | Accept new status values. Drop old status values. Used by `pull-plan-states` to apply pulled state. |
| `format-changelog.ts` | Read `shipped` + `wontdo` instead of `shipped` + `dropped`. Section heading for skipped items renames to "Deferred" (was "Dropped"). |
| `render-snapshot.ts` | Render new status enum in the snapshot's plan section. Show a Figma-link column for items with `commentId`. |
| `advance-phase.ts` | Accept new phase names. |

### Deleted

None. The phase deletions happen in skill files; scripts are repurposed or extended.

## Skills

### New

- `figloops-next-plan-ack` — handles both the initial render+anchor pass and the refresh pass. Detects which mode it's in by inspecting state: if `planFrame` is unset for the current round, run the render+anchor flow; otherwise run the refresh flow.

### Modified

- `figloops/SKILL.md` — update route table: remove `plan-approval` and `implement` rows, add `plan-ack`.
- `figloops-next-cluster/SKILL.md` — change "advance to plan-approval" → "advance to plan-ack", and "invoke skill `figloops-next-plan`" → "invoke skill `figloops-next-plan-ack`".
- `figloops-next-close/SKILL.md` — add cleanup step: call `cleanup-bot-replies.ts` before bumping round. Reduce tracker tasks from 9 → 8.
- `figloops-init/SKILL.md` — adjust initial task list to 8 entries (drop `[FIGLOOPS] Approve plan` and `[FIGLOOPS] Implement changes`, add `[FIGLOOPS] Ack plan in Figma`).

### Deleted

- `figloops-next-plan/SKILL.md`
- `figloops-next-implement/SKILL.md`

## Recovery handling

| Case | Detection | Handling |
|---|---|---|
| Plan frame deleted | MCP `get_metadata` on stored `frameId` returns not-found | Prompt: "Plan frame missing for Round N. Re-render? (Yes / Cancel)". Yes → re-run `render-plan-frame` + `anchor-plan-threads` (existing comment IDs are kept where possible by checking `comments[*].id`). Cancel → exit. |
| Thread deleted | REST GET returns 404 for stored `commentId` | Mark item `removed` in state. Surface in snapshot. Do not recreate. |
| Both frame and threads deleted | Both checks fail | Treat as a fresh re-anchor: discard stored IDs, re-render frame, re-POST threads. |
| User edits item text on the rendered frame | Not detected on refresh (state.json stays canonical) | On `close`, format-changelog uses `state.json.change` text, not the frame text. Document this as a caveat in the bot reminder or the README. |
| `commentId` exists but its row is no longer visible (frame ungrouped, item rows reordered) | No detection; anchor stays where Figma keeps it | Acceptable. Threads are anchored to file coords, not the frame. User-visible result is a comment dot that may overlap nothing. Re-render rebuilds the frame at clean coords. |

## Refresh delta print

After `pull-plan-states.ts` runs during a refresh:

```
🔄 Refreshed Round N plan

+ 2 newly shipped (#1, #4)
+ 1 newly skipped (#7)
= 3 still pending

Open in Figma to keep working, or run /figloops:next once everything is resolved or skipped.
```

If all items are now `shipped` or `wontdo`, the skill auto-advances to `close` and prints the close-round banner instead.

## Migration

One-shot migration: when `loadState` sees `schemaVersion: 1`, it transforms in-memory before validating against the v2 schema. The migration:

1. Sets `schemaVersion: 2`.
2. Rewrites `currentPhase`: `plan-approval` → `plan-ack`, `implement` → `plan-ack`.
3. Rewrites every `plan[*].status` per the mapping in "planStatusSchema" above.
4. Writes the migrated state back to disk on first read.

Migration runs once per state file. There is no rollback (v2 schema is strictly broader than v1 in fields, narrower in status values — round-trip is lossy).

State files in `await-comments` / `pull` / `comment-review` / `cluster` phases are unaffected by phase remapping; only schema field updates apply.

## Round tracker tasks

Old (9):
```
Capture · Push · Wait · Pull · Review · Cluster · Approve plan · Implement · Close
```

New (8):
```
Capture · Push · Wait · Pull · Review · Cluster · Ack plan in Figma · Close
```

The `Ack plan in Figma` task is marked `in_progress` when the plan frame is rendered and `completed` when the user advances to `close` (whether via auto-advance after a refresh or via close-after-some-pending).

## README + docs

- `README.md`: phase table (9→8 rows), gate table (5→4 gates).
- `docs/superpowers/specs/2026-05-20-figloops-v1-design.md`: add a note at the top pointing to this spec as the active design.
- `CHANGELOG.md`: entry under next version.

## Open questions

None at this time. All decisions ratified in the brainstorming conversation:
- Slash-prefix parser, `/skip` only (no `/add`, no `/edit`)
- Comment reply beats resolve when both present
- Themes do not re-cluster during plan-ack
- Refresh = re-run `/figloops:next` (no separate command)
- Recovery: re-render is opt-in via prompt, not silent

## Risks accepted

1. **REST cannot resolve comments programmatically.** Test fixtures cannot exercise the "shipped" path end-to-end via API — manual or browser-driven tests needed for that path.
2. **Bot replies post as the PAT owner.** No way to brand them as a system actor without a Figma org-level integration. Prepending `🤖` is the disambiguator.
3. **Anchor drift over time.** Comment dots stay at fixed file coords; if the user rearranges the page, dots may visually separate from rows. Re-render is the manual cure. Not auto-corrected.
4. **`/skip` parser is line-prefix-based.** A user pasting code that starts with `/skip` would trip it. Acceptable; the bot reminder educates expected use.
5. **Multi-designer race.** Two designers act on the same thread between refreshes. Latest reply wins per parse rule; resolve state reflects whichever click was last. No locking.
