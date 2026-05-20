---
description: Show all themes Claude has clustered to date, grouped by round
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
# figloops · themes history
```

Then, iterating rounds in numeric order from `1` up to `currentRound`, render each round as follows.

**Round header line:**
- If the round entry has `completedAt`: `## Round N — closed <YYYY-MM-DD>` (use the date portion of `completedAt`)
- Else if N equals `currentRound`: `## Round N — in progress (phase: <currentPhase>)`
- Else: `## Round N`

**Round body:**
- If the round has 0 themes: print `_no themes yet_` then a blank line. Continue to next round.
- Otherwise, for each theme in `round.themes` (preserve order):
  - Print `### <theme.name>`
  - Print `Cites: <comma-separated citations>` where each citation is `<authorName> (#<id>)` — look each `id` up in `round.comments` and use that comment's `authorName`. If a cited id is not found in `round.comments`, fall back to `#<id>`.
  - Print `Summary: <theme.summary>`
  - Print a blank line after each theme.

Print one blank line between rounds.

## Example output

```
# figloops · themes history

## Round 1 — closed 2026-05-12
### Navigation clarity
Cites: Sarah Lee (#12), Mike Chen (#17)
Summary: stakeholders struggled to orient inside the app.

### Color contrast
Cites: Anita Roy (#41)
Summary: secondary buttons read as disabled because contrast is too low.

## Round 2 — in progress (phase: cluster)
_no themes yet_
```

Do not add commentary outside this rendered output.
