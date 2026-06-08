---
name: figloops-reset
description: figloops reset handler — restart the current round or discard all rounds and start fresh
---

## Setup
Resolve `FIGLOOPS_PLUGIN_DIR` from env or `.env`. If unset, abort: `"FIGLOOPS_PLUGIN_DIR is not set. Add it to .env or your shell."` Always double-quote paths.

## Errors
State load fail → abort. TS exits non-zero → relay stderr verbatim.

---

## Handler

1. Read `feedback/state.json`:
   ```bash
   cat feedback/state.json
   ```
   If missing: print `"No active round. Run /figloops:init to set up."` Stop.

2. Parse `currentRound` (N), `currentPhase`, and `rounds[N].pushManifest`.

3. Ask:
   ```
   question: "What do you want to reset?"
   header: "Reset"
   options:
     - label: "Restart this round — wipe Round N data, go back to capture"
     - label: "Discard everything — archive state and start fresh"
     - label: "Cancel"
   ```

4. **On "Cancel":** Print `"Nothing changed."` Stop.

---

### Option A — Restart this round

5. Print a summary of what will happen:

   | | |
   |---|---|
   | Phase reset | `capture` |
   | State wiped | captures, pushManifest, comments, themes, plan for Round N |
   | Files deleted | `feedback/round-N/captures/` |
   | Figma page | If pushed: **must delete manually** (figloops cannot delete Figma pages) |

   If `pushManifest` exists, print:
   ```
   ⚠ A Figma page was created for Round N (pageId: <pushManifest.pageId>).
     Open your Figma file and delete that page manually before re-pushing.
   ```

6. Confirm:
   ```
   question: "Restart Round N? This cannot be undone."
   header: "Confirm restart"
   options:
     - label: "Yes — restart Round N"
     - label: "Cancel"
   ```
   On "Cancel": print `"Nothing changed."` Stop.

7. Delete captures folder:
   ```bash
   rm -rf "feedback/round-<N>/captures"
   ```

8. Reset state via tsx:
   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" -e "import('<PLUGIN_DIR>/src/state.js').then(({ loadState, writeState }) => { const s = loadState('feedback/state.json'); s.rounds[String(s.currentRound)] = { captures: [], pushManifest: null, comments: [], themes: [], plan: [] }; s.currentPhase = 'capture'; writeState('feedback/state.json', s); console.log('ok'); })"
   ```

9. Reset [FIGLOOPS] tasks: call `TaskList`. For each task whose subject starts with `[FIGLOOPS]` and status is `completed` or `in_progress`, call `TaskUpdate` to set status → `pending`. This re-arms the task list for the restarted round.

10. Print:
    ```
    ✓ Round N reset to capture phase.
    → Run /figloops:next to capture screenshots.
    ```
    If a push manifest existed, re-print the manual Figma page deletion reminder.

---

### Option B — Discard everything

5. Print a summary of what will happen:

   | | |
   |---|---|
   | Archived | `feedback/state.json` → `feedback/state.<timestamp>.json.bak` |
   | Files deleted | `feedback/round-*/captures/` (all rounds) |
   | Figma pages | All pushed Round pages — must delete manually |

6. Confirm:
   ```
   question: "Discard all rounds? state.json will be archived, not deleted."
   header: "Confirm discard"
   options:
     - label: "Yes — discard all rounds"
     - label: "Cancel"
   ```
   On "Cancel": print `"Nothing changed."` Stop.

7. Before archiving, read all `pushManifest.pageId` values from every round in state so you can report them to the user for manual Figma cleanup.

8. Archive state:
   ```bash
   mv "feedback/state.json" "feedback/state.$(date '+%Y%m%d-%H%M%S').json.bak"
   ```

9. Delete all captures:
   ```bash
   find feedback -type d -name captures -exec rm -rf {} + 2>/dev/null; true
   ```

10. Print:
    ```
    ✓ All rounds discarded. State archived.
    → Run /figloops:init to start fresh.
    ```
    If any rounds had a `pushManifest.pageId`, list them:
    ```
    Figma pages to delete manually:
      Round 1 — pageId: <id>
      Round 2 — pageId: <id>
    ```
