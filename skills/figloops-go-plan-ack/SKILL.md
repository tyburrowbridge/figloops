---
name: figloops-go-plan-ack
description: Plan-ack phase — render plan frame in Figma, anchor comment threads, refresh on subsequent runs
user-invocable: false
---

## Setup
Resolve `FIGLOOPS_PLUGIN_DIR` from env or `.env`. If unset, abort. Resolve `FIGMA_TOKEN` from env or `.env`. Scripts: `cd "<CONSUMING_REPO>" && "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/<name>.ts" <args>`. Always double-quote paths.

## Style
Status table per round. `AskUserQuestion` options carry no descriptions.

## Errors
TS exits non-zero → relay stderr verbatim, don't advance. MCP failure → prompt user to retry; don't advance.

---

## Handler

1. Mark `[FIGLOOPS] Ack plan in Figma` as `in_progress`.

2. Read `feedback/state.json` and `figloops.config.json` to get `figma.fileKey` and current round.

3. **Mode detection.** If `state.rounds[currentRound].planFrame` is unset → **render+anchor mode** (step 4). Else → **refresh mode** (step 7).

---

### Render + anchor mode

4. **Render frame.** Run:
   ```bash
   PAYLOAD=$("<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/render-plan-frame.ts" "feedback/state.json" <round>)
   ```
   Then invoke `use_figma` with `fileKey: <fileKey>`, `code: "$PAYLOAD"`, `description: "Render Round <N> plan frame"`. Capture the returned JSON: `{pageId, frameId, frameName, rows: [{itemId, index, nodeId}]}`.

5. **Persist frame result + assign rowIndex.** Read state.json, set `rounds[round].planFrame = {pageId, frameId, frameName}`, set `rowIndex` on each plan item from `rows`. Write back.

6. **Anchor threads.** Run:
   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/anchor-plan-threads.ts" "feedback/state.json" <round> "<fileKey>" "$FIGMA_TOKEN"
   ```
   Regenerate snapshot.

   Print:
   ```
   📋 Round <N> plan rendered in Figma — <count> items anchored.

   Open the Figma file and act on each item:
   - ✓ resolve the thread when you've shipped it
   - reply `/skip` to mark won't do
   - leave it open to discuss

   When you're done (or want to check in), re-run `/figloops:go`.
   ```

   Exit. Do not advance.

---

### Refresh mode

7. **Pull thread states.** Run:
   ```bash
   DELTA=$("<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/pull-plan-states.ts" "feedback/state.json" <round> "<fileKey>" "$FIGMA_TOKEN")
   ```
   Parse the JSON: `{statuses: {itemId → status}, delta: {shipped: [], wontdo: [], pending: [], removed: []}}`. The script has already written the new statuses back to state.json.

8. **Recovery check — plan frame deleted.** If any item now has `status: 'removed'` AND it was previously not `'removed'`, run `get_metadata` on `planFrame.frameId` to confirm. If frame is missing too, use `AskUserQuestion`:
   ```
   question: "Plan frame for Round <N> is missing. Re-render?"
   header: "Recovery"
   options:
     - label: "Re-render frame and threads  (Recommended)"
     - label: "Cancel — leave state as-is"
   ```
   - Re-render: clear `planFrame` and clear `commentId`/`botReplyId` on every item, then re-enter render+anchor mode (step 4).
   - Cancel: print the delta and exit.

9. **Print delta.**
   ```
   🔄 Refreshed Round <N> plan

   + <N> newly shipped (<#list>)
   + <N> newly skipped (<#list>)
   = <N> still pending
   ```
   Regenerate snapshot.

10. **Advance check.** Count items by status from the new state.
    - If any item is `pending` → exit. Tell user to keep working in Figma.
    - Else (all `shipped` / `wontdo` / `removed`) → mark task `completed`, run `advance-phase.ts close`, invoke skill `figloops-go-close`.
