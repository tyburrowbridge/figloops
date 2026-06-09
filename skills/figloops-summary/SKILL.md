---
name: figloops-summary
description: Render every round to date as a single status table
---

Read `feedback/state.json` in the current working directory.

**If the file does not exist**, print exactly:

```
figloops not initialized in this project.
→ Run /figloops:init to set up.
```

and stop. Do not call any other tools.

**If the file exists**, parse it and render the output described below. Read only `feedback/state.json` — do not invoke any skill, do not call MCP, do not run any other tool.

## Output format

Start with this header line:

```
# figloops · rounds summary
```

Then render a single markdown table with one row per round, iterating in numeric order from `1` up to `currentRound`.

**Columns:**

| Round | Status | Phase | Progress | Captures | Comments | Themes | Plan | Completed |
|---|---|---|---|---|---|---|---|---|

**Phase order (1-indexed, total 9):**
1. `capture`
2. `push`
3. `await-comments`
4. `pull`
5. `comment-review`
6. `cluster`
7. `plan-approval`
8. `implement`
9. `close`

**Per-round values:**
- **Round**: the round number (e.g. `1`).
- **Status**: `complete` if `round.completedAt` is set, otherwise `active`.
- **Phase**: 
  - If `round.completedAt` is set, render `closed` (cosmetic — the underlying phase value is `close`).
  - Else, render `state.currentPhase` verbatim.
- **Progress**: 10-character ASCII bar followed by ` N/9`.
  - For complete rounds: `██████████ 9/9`.
  - For the active round, determine `pos` = the 1-indexed position of `state.currentPhase` in the phase order list above. Fill = `round(pos / 9 * 10)` filled blocks (`█`), the rest empty (`░`). Append ` <pos>/9`.
  - Example: phase `await-comments` (pos 3) → `███░░░░░░░ 3/9`.
- **Captures**: `round.captures.length`.
- **Comments**: `round.comments.length`.
- **Themes**: `round.themes.length`.
- **Plan**: `round.plan.length`.
- **Completed**: 
  - If `round.completedAt` is set, format the date portion as `MMM DD YYYY` using English month abbreviations (`Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec`) and zero-padded day (e.g. `Jun 08 2026`, `Aug 13 2026`).
  - Else, render `—` (em dash).

Print a blank line after the table.

## Example output

```
# figloops · rounds summary

| Round | Status | Phase | Progress | Captures | Comments | Themes | Plan | Completed |
|---|---|---|---|---|---|---|---|---|
| 1 | complete | closed | ██████████ 9/9 | 5 | 12 | 3 | 4 | Jun 08 2026 |
| 2 | complete | closed | ██████████ 9/9 | 6 | 14 | 4 | 5 | Jun 09 2026 |
| 3 | active | await-comments | ███░░░░░░░ 3/9 | 7 | 0 | 0 | 0 | — |
```

Do not add commentary outside this rendered output.
