---
description: Show the current round tracker without advancing
---

1. Read `feedback/state.json`:
   ```bash
   cat feedback/state.json
   ```
   If the file is missing: print `"No active round found. Run /figloops:init to set up."` and stop.

2. Parse `currentRound` and `currentPhase`.

3. Print: `Round <currentRound> · phase: <currentPhase>`

4. Use `TaskList` to enumerate all tasks. Filter to subjects starting with `[FIGLOOPS]`. Print each as a status line.

Do not advance state. Do not call MCP.
