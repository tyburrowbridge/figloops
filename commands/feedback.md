---
description: Show user feedback by round and frame
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
# figloops · feedback history
```

Then, iterating rounds in numeric order from `1` up to `currentRound`, render each round as follows.

**Round header line:**
- If the round entry has `completedAt`: `## Round N — closed <YYYY-MM-DD>` (use the date portion of `completedAt`)
- Else if N equals `currentRound`: `## Round N — in progress (phase: <currentPhase>)`
- Else: `## Round N`

**Round body:**
- If the round has 0 comments: print `_no comments yet_` then a blank line. Continue to next round.
- Otherwise, group the round's comments by `frameLabel`. For each frame group (preserve the comments' insertion order to determine group order):
  - Print `### Frame "<frameLabel>"` (or `### (no frame)` if `frameLabel` is null)
  - For each comment in the group: print on a single line:
    ```
    - **<authorName>** (#<id>) — "<message>"
    ```
  - If a comment's `message` contains newlines, replace them with spaces so each comment stays on one line.

Print one blank line between rounds.

## Example output

```
# figloops · feedback history

## Round 1 — closed 2026-05-12
### Frame "Login"
- **Sarah Lee** (#12) — "The CTA below the form is hard to find."
- **Mike Chen** (#17) — "Form copy is unclear; add helper text."
### Frame "Dashboard"
- **Sarah Lee** (#23) — "Nav doesn't show what's active."

## Round 2 — in progress (phase: implement)
### Frame "Login"
- **Anita Roy** (#41) — "Button contrast is too low."
```

Do not add commentary outside this rendered output.
