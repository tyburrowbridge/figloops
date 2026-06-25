---
description: Crawl the running app to auto-detect modal/panel/menu/tab scenarios
---

1. Read `figloops.config.json` in the current working directory:
   ```bash
   cat figloops.config.json
   ```
   If the file is missing: print `"figloops not initialized. Run /figloops:init first."` and stop.

2. **Dev server preflight.** The crawler drives a real browser against `devServer.url`. Tell the user the dev server must be running at that URL. If they confirm it isn't, stop and ask them to start it first.

3. Invoke the skill `figloops-discover`. The config read in step 1 is already in context — the skill does not need to re-read it.
