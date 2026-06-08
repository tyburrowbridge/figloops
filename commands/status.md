---
description: Show the current round tracker and Figma connection health without advancing
---

## Connection health check

Run both checks in parallel before showing the round tracker.

**Figma PAT:**
```bash
"$FIGLOOPS_PLUGIN_DIR/node_modules/.bin/tsx" "$FIGLOOPS_PLUGIN_DIR/scripts/validate-token.ts"
```
- `FIGLOOPS_PLUGIN_DIR` from env or `.env`. If unset: mark PAT as `⚠ unknown (FIGLOOPS_PLUGIN_DIR not set)`.
- Exit 0 → `✓ Figma PAT valid — <handle>`
- Exit non-zero → `✗ Figma PAT invalid — <stderr>`

**Figma MCP:**
- Check that `use_figma` is available as a tool.
- Available → `✓ Figma MCP connected`
- Not available → `✗ Figma MCP not found — run setup at https://github.com/figma/mcp-server-guide`

Print health summary table:

| Check | Status |
|---|---|
| Figma PAT | ✓ / ✗ / ⚠ |
| Figma MCP | ✓ / ✗ |

---

## Round tracker

1. Read `feedback/state.json`:
   ```bash
   cat feedback/state.json
   ```
   If missing: print `"No active round. Run /figloops:init to set up."` and stop.

2. Parse `currentRound` and `currentPhase`.

3. Print: `Round <currentRound> · phase: <currentPhase>`

4. Use `TaskList`. Filter subjects starting with `[FIGLOOPS]`. Print each as a status line.

Do not advance state.
