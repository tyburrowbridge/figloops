---
description: List commands; show current phase if a round is active
---

Read `feedback/state.json` in the current working directory if it exists. Also read `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` and parse its `version` field — use this as `<version>` in both rendered screens below. If the read fails, render `?.?.?` for `<version>`.

**If the file exists**, parse `currentRound` and `currentPhase`, then print the following (replace `<version>`, `<round>` and `<phase>` with the values; for `<next-action>` use the phrase appropriate to the phase — see table below). Do not call any other tools beyond the two reads above.

````
figloops v<version>
User feedback loops for web prototypes.

  CURRENT
  Round <round> · phase: <phase>
  → <next-action>

COMMANDS
  :next      Advance the round to the next phase or gate
  :status    Show round tracker without advancing
  :feedback  Show all user feedback to date (grouped by round)
  :themes    Show all clustered themes to date (grouped by round)
  :summary   One-table rollup of all rounds to date
  :discover  Auto-detect modal/panel/menu/tab scenarios
  :restart   Restart the current round or discard all rounds
  :init      One-time project setup
  :uninstall Remove all local figloops files (Figma file untouched)
  :whatsnew  Show release notes + check for available upgrade
  :help      This screen
````

Phase → next-action phrase:
- `capture` → "Run /figloops:go to capture screenshots"
- `push` → "Run /figloops:go to push captures to Figma"
- `await-comments` → "Run /figloops:go when users respond"
- `pull` → "Run /figloops:go to fetch comments"
- `comment-review` → "Run /figloops:go to advance after reviewing comments"
- `cluster` → "Run /figloops:go to cluster comments by theme"
- `plan-ack` → "Run /figloops:go to render the plan in Figma and review thread states"
- `close` → "Run /figloops:go to close the round and write the changelog"

**If `feedback/state.json` does not exist**, print this instead (banner included — this is the welcome screen for users who haven't initialized yet):

````
███████╗██╗ ██████╗ ██╗      ██████╗  ██████╗ ██████╗ ███████╗
██╔════╝██║██╔════╝ ██║     ██╔═══██╗██╔═══██╗██╔══██╗██╔════╝
█████╗  ██║██║  ███╗██║     ██║   ██║██║   ██║██████╔╝███████╗
██╔══╝  ██║██║   ██║██║     ██║   ██║██║   ██║██╔═══╝ ╚════██║
██║     ██║╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║     ███████║
╚═╝     ╚═╝ ╚═════╝ ╚══════╝ ╚═════╝  ╚═════╝ ╚═╝     ╚══════╝
                                                          v<version>

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
  :summary   One-table rollup of all rounds to date
  :discover  Auto-detect modal/panel/menu/tab scenarios
  :uninstall Remove all local figloops files (Figma file untouched)
  :whatsnew  Show release notes + check for available upgrade
  :help      This screen

Requires: Figma MCP connected, Figma PAT
````

Do not invoke any skill, do not call any other tools, and do not add any text outside of the rendered help screen.
