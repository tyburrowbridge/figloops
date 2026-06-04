---
description: Advance the round to the next phase or user gate
---

1. Read `feedback/state.json`:
   ```bash
   cat feedback/state.json
   ```
   If the file is missing: print `"No active round found. Run /figloops:init to set up."` and stop.

2. Parse `currentPhase` from the JSON.

3. **MCP preflight** — skip only if `currentPhase` is `await-comments`:
   - Confirm `use_figma` (or `figma_execute` from southleft/figma-console-mcp) is available.
   - If unavailable: print `✗ No Figma MCP write tool found`. Tell user to install the official Figma MCP server at https://github.com/figma/mcp-server-guide. Stop.

4. Invoke the matching skill. The state JSON read in step 1 is already in context — the invoked skill does not need to re-read it unless its phase mutates state before rendering.

   | `currentPhase` | Skill to invoke |
   |---|---|
   | `capture` | `figloops-next-capture` |
   | `push` | `figloops-next-push` |
   | `await-comments` | `figloops-next-await` |
   | `pull` | `figloops-next-pull` |
   | `comment-review` | `figloops-next-review` |
   | `cluster` | `figloops-next-cluster` |
   | `plan-approval` | `figloops-next-plan` |
   | `implement` | `figloops-next-implement` |
   | `close` | `figloops-next-close` |
