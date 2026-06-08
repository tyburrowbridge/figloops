---
description: Restart the current round or discard all rounds and start fresh
---

1. Read `feedback/state.json`:
   ```bash
   cat feedback/state.json
   ```
   If missing: print `"No active round. Run /figloops:init to set up."` Stop.

2. Invoke skill `figloops-reset`.
