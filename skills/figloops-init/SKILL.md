---
name: figloops-init
description: Setup wizard — verifies MCP, PAT, Figma file; collects config
---

## Setup
Resolve `FIGLOOPS_PLUGIN_DIR`: the parent of this skill's parent directory (e.g., `.../figloops`). If `FIGLOOPS_PLUGIN_DIR` env var is set, use it directly. Otherwise resolve from the skill file path, print the resolved path, and write it to `.env` in step 9. Scripts: `cd "<CONSUMING_REPO>" && "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/<name>.ts" <args>`. Always double-quote all paths.

## Style
Tables for 2+ comparable fields (escape `|` → `\|`, newlines → spaces in cells). Icons: `→` checking · `✓` pass · `✗` fail · `⚠` warning. `AskUserQuestion` options carry no descriptions. Blockquote + bold for plain-text input prompts.

## Errors
TS exits non-zero → relay stderr verbatim. MCP fail → relay error and abort. State load fail → abort.

---

## Wizard

### Step 0 — Welcome banner

Print this first, before any tool calls:

````
```
███████╗██╗ ██████╗ ██╗      ██████╗  ██████╗ ██████╗ ███████╗
██╔════╝██║██╔════╝ ██║     ██╔═══██╗██╔═══██╗██╔══██╗██╔════╝
█████╗  ██║██║  ███╗██║     ██║   ██║██║   ██║██████╔╝███████╗
██╔══╝  ██║██║   ██║██║     ██║   ██║██║   ██║██╔═══╝ ╚════██║
██║     ██║╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║     ███████║
╚═╝     ╚═╝ ╚═════╝ ╚══════╝ ╚═════╝  ╚═════╝ ╚═╝     ╚══════╝

Welcome to figloops — user feedback loops for web prototypes.
Setting up your project now…
```

Before we begin, you'll need:

- **Figma MCP** connected to this Claude Code session — https://github.com/figma/mcp-server-guide
- **Figma Personal Access Token** — https://www.figma.com/developers/api#access-tokens
- **A Figma file URL** to push screenshots into *(recommended: a dedicated file — figloops creates new pages on every round)*
- **Your app URL** — local (`http://localhost:3000`) or deployed (Vercel, Netlify, GitHub Pages, etc.)
````

### Step 1 — MCP preflight

Print `→ Checking for Figma MCP write tool…`. Confirm `use_figma` (or `figma_execute` from southleft/figma-console-mcp) is available. On fail: print `✗ No Figma MCP write tool found`, tell user to install the official Figma MCP server at https://github.com/figma/mcp-server-guide, abort.

Auth probe:
- Check for token: `FIGMA_TOKEN` in process env, or a `FIGMA_TOKEN=` line in `.env`. Extract the value without running any script.
- If no token found: print `→ No FIGMA_TOKEN found — will collect in Step 5.` and continue. Do NOT call validate-token.ts.
- If token found: print `→ Verifying Figma auth…`, then run:
  `FIGMA_TOKEN=<token> "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/validate-token.ts"`
  - On success: print `✓ Auth confirmed — **<handle>**`
  - On fail (bad token / 401): print `✗ Figma auth failed — <error>` and abort.

### Step 2 — Existing project detection

**2a. `feedback/state.json`** — if present:
```
question: "An in-progress round already exists. What do you want to do?"
header: "Existing round"
options:
  - label: "Resume — exit init, just run /figloops:next"
  - label: "Archive — rename state.json to a backup and start fresh"
  - label: "Cancel — don't change anything"
```
- Resume: read `currentRound` and `currentPhase` from the file. Print `"Round <N> phase <phase> is in progress. Run /figloops:next to continue."` Abort.
- Archive: rename to `feedback/state.<YYYYMMDD-HHMMSS>.json.bak` (use `date '+%Y%m%d-%H%M%S'`). Tell user the backup path. Continue.
- Cancel: print `"Cancelled. Existing round preserved."` Abort.

**2b. `figloops.config.json`** — if present, try to validate with an existing token. Check `process.env.FIGMA_TOKEN` then `.env` file for a `FIGMA_TOKEN=` line.

If a token is available, run:
```bash
"<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/validate-file.ts" "<KEY_FROM_CONFIG>"
```

Three branches:

- **Validation succeeds:**
  ```
  question: "Existing figloops.config.json found and Figma file validates. Reuse it?"
  header: "Existing config"
  options:
    - label: "Reuse — skip wizard, re-init state only"
    - label: "Walk through wizard — current values become defaults"
    - label: "Start fresh — archive old config and re-collect everything"
  ```
  - Reuse: skip to step 10 (Initialize state). Steps 3–9 are unnecessary.
  - Walk through wizard: continue normally; pre-fill answers in steps 5–7 from existing config where options are presented.
  - Start fresh: rename `figloops.config.json` to `figloops.config.<YYYYMMDD-HHMMSS>.json.bak`. Continue.

- **Validation fails (401/403/404 or network):** tell user `"Existing figloops.config.json points to a Figma file that isn't accessible (fileKey: <KEY>, error: <msg>)."` Then:
  ```
  question: "How do you want to handle the stale config?"
  header: "Stale config"
  options:
    - label: "Archive it and start fresh"
    - label: "Keep it (I'll fix the fileKey manually) — abort init"
  ```
  - Archive: rename to `.bak`. Continue.
  - Keep it: abort with a one-line summary of what to fix.

- **No token available:** print `"Existing figloops.config.json found, but no FIGMA_TOKEN is set so it can't be validated yet."` Then:
  ```
  question: "What do you want to do with the existing config?"
  header: "Existing config"
  options:
    - label: "Reuse it — skip wizard, re-init state only"
    - label: "Start fresh — archive and re-collect everything"
  ```
  - Reuse: skip to step 10.
  - Start fresh: archive + continue.

If neither file exists, skip this step entirely.

### Step 3 — Setup checklist

Create 5 tasks in a single message (all `pending`):
- `[FIGLOOPS] Verify Figma MCP`
- `[FIGLOOPS] Authenticate with Figma`
- `[FIGLOOPS] Connect Figma file`
- `[FIGLOOPS] Configure project settings`
- `[FIGLOOPS] Initialize figloops`

Immediately mark `[FIGLOOPS] Verify Figma MCP` and `[FIGLOOPS] Authenticate with Figma` as `completed` (steps 1 already passed both checks).

### Step 4 — Figma file URL

```
question: "Do you have a Figma file ready for this project?"
header: "Figma file"
options:
  - label: "Yes — I have a file ready"
  - label: "No — I need to create one first"
```
- No: print `"Open Figma, create a new file, then re-run /figloops:init."` Abort.
- Yes: print the blockquote prompt:
  ```
  > 🔗 **Paste your Figma file URL below** — I'm waiting for your input before continuing setup.
  > Accepted formats: `https://www.figma.com/design/…` · `https://www.figma.com/file/…` · `https://www.figma.com/proto/…`
  ```
  Extract and store the file key. Re-prompt with the same blockquote if the URL doesn't match any accepted format.

### Step 5 — Figma PAT

Mark `[FIGLOOPS] Authenticate with Figma` as `in_progress` (if not already `completed` from step 2b).

Check `process.env.FIGMA_TOKEN` then `.env` file. If found, validate:
```bash
"<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/validate-token.ts"
```
On success: print `"🔑 Found an existing FIGMA_TOKEN — validated successfully."` Mark `Authenticate with Figma` as `completed`. Skip to step 6.

On failure or no token found:
```
question: "How would you like to set up your Figma Personal Access Token?"
header: "Figma PAT"
options:
  - label: "I already have one — I'll paste it now"
  - label: "I need to create one"
  - label: "It's already in my shell / .env"
```
- "I already have one": print:
  ```
  > 🔑 **Paste your Figma Personal Access Token below** — I'm waiting for your input before continuing.
  > Starts with `figd_` (API tokens) or a legacy bearer token.
  ```
- "I need to create one": print `https://www.figma.com/developers/api#access-tokens` with scope instructions. Abort — tell user to re-run `/figloops:init` when they have the token.
- "It's already in my shell / .env": re-check env + `.env` file. If still not found, tell user the variable name to set (`FIGMA_TOKEN`). Abort.

After receiving the token, set `FIGMA_TOKEN=<token>` in the env for this invocation (do not write to `.env` yet). Validate:
```bash
"<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/validate-token.ts"
```
On failure (401/network): abort with the error + `https://www.figma.com/developers/api#access-tokens`. On success: mark `Authenticate with Figma` as `completed`.

### Step 6 — Figma file validation

Mark `[FIGLOOPS] Connect Figma file` as `in_progress`. Use the file key from step 4:
```bash
"<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/validate-file.ts" "<KEY>"
```
On 403/404: surface the error and re-prompt for a corrected URL (same blockquote format as step 4). On success: mark `[FIGLOOPS] Connect Figma file` as `completed`.

### Step 7 — Project config

Mark `[FIGLOOPS] Configure project settings` as `in_progress`.

**7a. Dev server URL:**
```
question: "Where is your app running?"
header: "App URL"
options:
  - label: "http://localhost:3000"
  - label: "http://localhost:5173"
  - label: "Vercel / Netlify / GitHub Pages — I have a URL"
  - label: "Other"
```
- "Vercel / Netlify / GitHub Pages" or "Other" → blockquote: `> 🔗 **Enter your app URL** (e.g. \`https://my-app.vercel.app\` or \`http://localhost:4000\`)`
- Accept any valid URL — local or remote.

**7b. Viewport:**
```
question: "What viewport size should figloops capture at?"
header: "Viewport"
options:
  - label: "1440 × 900  (Recommended)"
  - label: "1920 × 1080"
  - label: "1280 × 800"
  - label: "390 × 844"
```
"Other" → parse `width x height` or `width × height` from the user's input.

**7c. UI theme:**
```
question: "What color theme does your app use?"
header: "UI theme"
options:
  - label: "Light  (white/light backgrounds)  (Recommended)"
  - label: "Dark  (dark backgrounds)"
```
Store as `light` or `dark`. Used to pick a contrasting Figma page background so frames stand out.

**7d. Changelog page name:** always `"Changelog"`. Do not ask.

**7e. Route discovery.**

Detect framework from `package.json` (`dependencies` + `devDependencies`):

| Framework | Route source | File pattern |
|---|---|---|
| `next` (pages router) | `pages/` | `pages/**/*.{tsx,ts,jsx,js}` — exclude `_app`, `_document`, `_error`, `404`, `500`, `pages/api/**` |
| `next` (app router) | `app/` | `app/**/page.{tsx,ts,jsx,js}` |
| `nuxt` | `pages/` | `pages/**/*.vue` |
| `@sveltejs/kit` | `src/routes/` | `src/routes/**/+page.svelte` |
| `react-router*` / `@tanstack/react-router` | grep | see below |
| `vue-router` | grep | see below |
| none matched | fallback | see below |

React Router grep (use `-E`; use `[[:space:]]` not `\s`):
```bash
grep -rEl "(createBrowserRouter|createHashRouter|RouterProvider|BrowserRouter|<Route)" src/ --include="*.tsx" --include="*.ts" --include="*.jsx" --include="*.js" 2>/dev/null | head -20
```

Vue Router grep:
```bash
grep -rEl "(createRouter|RouterView|routes[[:space:]]*:)" src/ --include="*.ts" --include="*.js" --include="*.vue" 2>/dev/null | head -10
```

Read matched files and extract `path:` or `<Route path=` values.

Fallback (no framework matched):
```bash
curl -s "<DEV_SERVER_URL>" | grep -oP 'href="[^"#?]+"' | sort -u
```
Extract internal paths (start with `/`). If nothing: ask the user for routes as plain text (`Label  /path`, one per line).

**Path conversion:** strip source prefix + filename; convert `[param]` → `:param`. Skip dynamic routes (contain `:param`); list them separately as skipped with reason. Label: title-case the last segment, replace `-`/`_` with spaces. Ensure all paths start with `/` (prepend silently if missing).

Present as a table:
```
Found N routes in your <framework> project:

| Path | Label |
|---|---|
| / | Home |
| /login | Login |

Skipped (dynamic — no fixed URL to capture):

| Path | Reason |
|---|---|
| /products/[id] | dynamic segment |
```

**Route probe (optional):**
```
question: "Is your dev server running at <URL>? figloops can check which pages actually load."
header: "Check pages"
options:
  - label: "Yes — check them"
  - label: "Not running — skip"
```
If "Yes":
```bash
echo '<PAYLOAD_JSON>' | "<PLUGIN_DIR>/node_modules/.bin/tsx" "<PLUGIN_DIR>/scripts/probe-routes.ts"
```
Payload = `{ "baseUrl": "<URL>", "routes": [{"label": "...", "path": "..."}, ...] }`. Parse stdout: `{ serverReachable, entryLinks, routes: [{label, path, status, reachable, linkedFromEntry, finalUrl?, error?}] }`.

- `serverReachable === false`: print can't reach URL, continue with unannotated list.
- `serverReachable === true`: re-render. Add "Issue" column only if ≥1 route failed (leave cell blank for healthy rows). For SPAs, if `entryLinks` is empty note it once: `"Note: / returned no <a href> links (typical for SPAs)."` For redirects, append `→ <finalUrl>`. Note once: `"figloops captures top-level routes. Modal/drawer-style overlays aren't detected — add them manually if needed."`

**Route list options:**
```
question: "What would you like to do with these routes?"
header: "Route list"
options:
  - label: "Capture all of them"
  - label: "Remove some"
  - label: "Add more"
  - label: "Start fresh"
```
- Remove some: ask which paths to drop (plain text, one per line). Remove, show updated list, ask again with same 4 options.
- Add more: ask for `label  /path` pairs (plain text). Append, show updated list, ask again.
- Start fresh: ask user to provide the full list as plain text (`Label  /path`, one per line). Require ≥1.

Require ≥1 route before continuing.

**7f. Scenarios (optional).**

Check `package.json` for known UI libraries:

| Category | Packages |
|---|---|
| Modal/dialog | `react-modal`, `@radix-ui/react-dialog`, `@headlessui/react`, `vaul`, `@mantine/core`, `@mui/material`, `@chakra-ui/react`, `react-bootstrap`, `react-aria-components` |
| Toast/notification | `sonner`, `react-hot-toast`, `react-toastify`, `@radix-ui/react-toast`, `notistack` |
| Theme/dark mode | `next-themes`, `theme-ui` |

Print detected libraries (or `"No common UI-state libraries detected."`).

```
question: "Add scenarios beyond top-level routes? (modals, dark mode, empty/error states, etc.)"
header: "Scenarios"
options:
  - label: "Yes — add some now"
  - label: "Skip — I'll add them later"
```

If "Yes", prompt as plain text:
```
Enter one scenario per line:  <label> | <path> | <selector1>; <selector2>; ...

- label: short name for the Figma frame (e.g. "Sign up modal")
- path: URL to navigate to first (e.g. "/")
- selectors: optional, semicolon-separated CSS selectors to click in order before capture

Blank line to finish.
```
Parse each line: split on `|` (trim). Required: `label`, `path` (must start with `/`). Optional `setup`: split on `;`, trim, reject empty strings. Reject invalid lines, surface errors, re-prompt.

Show parsed list and confirm:
```
question: "Add these scenarios?"
header: "Confirm scenarios"
options:
  - label: "Add them all"
  - label: "Start over"
  - label: "Skip — add none"
```

**7g. Git workflow** (only if cwd is a git repo).

Check: `git rev-parse --is-inside-work-tree 2>/dev/null`. If exits non-zero or does not print `true`: skip entirely; omit the `git` block from config.

If it's a git repo:
```
question: "How should figloops handle git branches per round?"
header: "Git branches"
options:
  - label: "Always create one  (Recommended)"
  - label: "Ask me each round"
  - label: "Never — I'll manage git myself"
```
Store as `always`, `ask`, or `never`.

Mark `[FIGLOOPS] Configure project settings` as `completed`.

### Step 8 — Write `figloops.config.json`

```json
{
  "$schema": "<absolute PLUGIN_DIR path>/config.schema.json",
  "devServer": { "url": "<URL>", "waitFor": "networkidle" },
  "viewport": { "width": <W>, "height": <H> },
  "uiTheme": "<light|dark>",
  "figma": { "fileKey": "<KEY>", "changelogPageName": "<NAME>" },
  "routes": [ { "label": "<LABEL>", "path": "<PATH>" } ],
  "scenarios": [ { "label": "<LABEL>", "path": "<PATH>", "setup": ["<SELECTOR>"] } ],
  "git": { "branchPerRound": "<ask|always|never>" }
}
```

Omit `scenarios` entirely if none were collected in step 7e. Omit `git` entirely if step 7f was skipped (not a git repo).

### Step 9 — Write `.env`

Do NOT overwrite if `.env` already exists — instead print the keys the user should add manually:
```
FIGMA_TOKEN=<token from step 5>
FIGLOOPS_PLUGIN_DIR=<PLUGIN_DIR>
```

### Step 9b — Write Claude permission allowlist

Merge these entries into `.claude/settings.json` in the project root (create if missing, preserve existing keys and entries):

```json
{
  "permissions": {
    "allow": [
      "Bash(curl -s http://localhost*)",
      "Bash(*/.claude/plugins/cache/figloops/*/node_modules/.bin/tsx */.claude/plugins/cache/figloops/*/scripts/*)"
    ]
  }
}
```

If the file exists, read it first and merge — add only entries not already present in `permissions.allow`. Do not remove any existing entries.

Print: `→ Claude allowlist updated — figloops scripts will run without prompts.`

### Step 10 — Initialize state

Mark `[FIGLOOPS] Initialize figloops` as `in_progress`. Run:
```bash
"<PLUGIN_DIR>/node_modules/.bin/tsx" -e "import('<PLUGIN_DIR>/src/state.js').then(m => { m.initState('feedback/state.json'); console.log('initialized'); })"
```
Mark `[FIGLOOPS] Initialize figloops` as `completed`.

### Step 11 — Create round tracker

Call `TaskCreate` 9 times in a single message (all `pending`):
- `[FIGLOOPS] Capture screenshots`
- `[FIGLOOPS] Push to Figma`
- `[FIGLOOPS] Wait for user comments`
- `[FIGLOOPS] Pull comments`
- `[FIGLOOPS] Review comments`
- `[FIGLOOPS] Cluster themes`
- `[FIGLOOPS] Approve plan`
- `[FIGLOOPS] Implement changes`
- `[FIGLOOPS] Close round`

### Step 12 — Ready summary

Print as final output (after all tool calls, so it renders below the task list):
```
---
🎉 **You're all set!**

> ▶ **Run `/figloops:next`** to capture your first screenshots and kick off Round 1.
---
```
