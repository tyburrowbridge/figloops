---
name: figloops-uninstall
description: Remove all local figloops files (state, config, .env keys). Figma file untouched.
user-invocable: false
---

## Setup
Resolve `FIGLOOPS_PLUGIN_DIR` from env or `.env`. If unset, abort: `"FIGLOOPS_PLUGIN_DIR is not set. Add it to .env or your shell."` Always double-quote paths.

## Style
Use `→` checking · `✓` done · `✗` fail · `⚠` warning. Tables for multi-row reports.

## Errors
TS exits non-zero → relay stderr verbatim and abort.

---

## Handler

1. **Detect footprint** via dry-run:
   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/uninstall.ts" --dry-run
   ```
   Capture stdout. If output is `Nothing to uninstall.`, print:
   ```
   No figloops files detected in this directory. Nothing to do.

   If the plugin itself is still installed, remove it from Claude Code:
     /plugin uninstall figloops@figloops
     /plugin marketplace remove figloops
   ```
   Stop.

2. **Print report** verbatim from step 1 output, prefixed with:
   ```
   Will remove the following local files:

   ```
   Then append:
   ```

   Figma file, pages, and comments are NOT touched. Delete them manually if wanted.
   Plugin install itself is not touched — handle that with /plugin uninstall after.
   ```

3. **Confirm:**
   ```
   question: "Proceed with uninstall? This cannot be undone."
   header: "Uninstall"
   options:
     - label: "Yes — delete the files listed above"
     - label: "Cancel"
   ```
   On Cancel: print `"Nothing changed."` Stop.

4. **Execute:**
   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/uninstall.ts"
   ```
   Relay stdout verbatim.

5. **Clear `[FIGLOOPS]` tasks.** Call `TaskList`. For each task whose subject starts with `[FIGLOOPS]`, call `TaskUpdate` with status `deleted`.

6. **Print final instructions:**
   ```
   ✓ figloops local files removed.

   To finish uninstalling the plugin from Claude Code, run:
     /plugin uninstall figloops@figloops
     /plugin marketplace remove figloops

   Figma file unchanged — open Figma to delete pages/comments if wanted.
   ```
