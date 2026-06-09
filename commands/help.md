---
description: List commands; show current phase if a round is active
---

Read `feedback/state.json` in the current working directory if it exists.

**If the file exists**, parse `currentRound` and `currentPhase`, then print the following (replace `<round>` and `<phase>` with the values; for `<next-action>` use the phrase appropriate to the phase — see table below). Do not call any other tools.

````
figloops
User feedback loops for web prototypes.

  CURRENT
  Round <round> · phase: <phase>
  → <next-action>

COMMANDS
  :next      Advance the round to the next phase or gate
  :status    Show round tracker without advancing
  :feedback  Show all user feedback to date (grouped by round)
  :themes    Show all clustered themes to date (grouped by round)
  :restart   Restart the current round or discard all rounds
  :init      One-time project setup
  :help      This screen
````

Phase → next-action phrase:
- `capture` → "Run /figloops:next to capture screenshots"
- `push` → "Run /figloops:next to push captures to Figma"
- `await-comments` → "Run /figloops:next when users respond"
- `pull` → "Run /figloops:next to fetch comments"
- `comment-review` → "Run /figloops:next to advance after reviewing comments"
- `cluster` → "Run /figloops:next to cluster comments by theme"
- `plan-approval` → "Run /figloops:next to review and approve the plan"
- `implement` → "Run /figloops:next to track implementation progress"
- `close` → "Run /figloops:next to close the round and write the changelog"

**If `feedback/state.json` does not exist**, print this instead (banner included — this is the welcome screen for users who haven't initialized yet):

````
███████╗██╗ ██████╗ ██╗      ██████╗  ██████╗ ██████╗ ███████╗
██╔════╝██║██╔════╝ ██║     ██╔═══██╗██╔═══██╗██╔══██╗██╔════╝
█████╗  ██║██║  ███╗██║     ██║   ██║██║   ██║██████╔╝███████╗
██╔══╝  ██║██║   ██║██║     ██║   ██║██║   ██║██╔═══╝ ╚════██║
██║     ██║╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║     ███████║
╚═╝     ╚═╝ ╚═════╝ ╚══════╝ ╚═════╝  ╚═════╝ ╚═╝     ╚══════╝

User feedback loops for web prototypes.

  NOT INITIALIZED
  No figloops.config.json in this project.
  → Run /figloops:init to set up

COMMANDS
  :init      One-time project setup wizard
  :next      Advance the round (after init)
  :status    Show round tracker
  :feedback  Show all user feedback to date
  :themes    Show all clustered themes to date
  :help      This screen

Requires: Figma MCP connected, Figma PAT
````

Do not invoke any skill, do not call any other tools, and do not add any text outside of the rendered help screen.
