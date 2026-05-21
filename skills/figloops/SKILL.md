---
name: figloops
description: Wizard-driven figloops workflow. Use when handling /figloops:* commands. The skill has four phases (init, next, status, help); `next` is a state machine over feedback/state.json with four interactive gates plus one passive gate per round. Coordinates TS helper scripts with the Figma MCP server.
---

# figloops orchestration

You are handling a phase of the figloops plugin. The slash command tells you which phase: `init`, `next`, `status`, or `help`.

## Resolving the plugin directory

The user runs slash commands in a consuming repo, not in the plugin's repo. The skill needs to invoke the plugin's TS helper scripts. Resolve the plugin path like this:

1. Read `$FIGLOOPS_PLUGIN_DIR` from the user's environment (or from the consuming repo's `.env`).
2. If unset and the phase is `init`, ask the user for it and write it into the new `.env` along with `FIGMA_TOKEN`.
3. If unset for any other phase, abort with: `"FIGLOOPS_PLUGIN_DIR is not set. Add it to .env or your shell. See README."`

For the rest of this skill, when you see `<PLUGIN_DIR>` or `<CONSUMING_REPO>` in commands, substitute the actual absolute path **wrapped in double quotes** — both paths may contain spaces. Run TS scripts as: `cd "<CONSUMING_REPO>" && ""<PLUGIN_DIR>/node_modules/.bin/tsx"" "<PLUGIN_DIR>/scripts/<name>.ts" <args>`. Never use backslash-escaped spaces in paths — always quote instead.

## MCP preflight (used by init + every non-status invocation of next)

Before any phase that touches Figma:

1. List your available MCP tools. Confirm a Figma MCP write tool is available (typically `use_figma` from the official `figma/mcp-server-guide` server, or `figma_execute` from `southleft/figma-console-mcp`).
2. If no Figma MCP write tool is connected, abort and tell the user:
   - That the Figma MCP server is required.
   - To install the official Figma MCP server (remote mode) per https://github.com/figma/mcp-server-guide.
   - That the community alternative `southleft/figma-console-mcp` is documented as a free option.
   - Do not proceed with any other steps.
3. For init only, also run a probe call: ask the MCP for the user's identity or any read-only operation it supports. If it errors with auth, abort init with the MCP setup link.

---

## Phase: `init`

The init wizard refuses to complete until every external check passes.

0. **Welcome banner.** Print this exactly (inside a fenced code block so the box-drawing characters keep their spacing). This is the first thing the user sees after installing the plugin — show it before any tool calls.

   ````
   ```
   ███████╗██╗ ██████╗ ██╗      ██████╗  ██████╗ ██████╗ ███████╗
   ██╔════╝██║██╔════╝ ██║     ██╔═══██╗██╔═══██╗██╔══██╗██╔════╝
   █████╗  ██║██║  ███╗██║     ██║   ██║██║   ██║██████╔╝███████╗
   ██╔══╝  ██║██║   ██║██║     ██║   ██║██║   ██║██╔═══╝ ╚════██║
   ██║     ██║╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║     ███████║
   ╚═╝     ╚═╝ ╚═════╝ ╚══════╝ ╚═════╝  ╚═════╝ ╚═╝     ╚══════╝

   Welcome to figloops — user feedback loops for localhost prototypes.
   Setting up your project now…
   ```
   ````

1. **MCP preflight** (above). On failure, abort here.

2. **Create the setup checklist.** Call `TaskCreate` 5 times in a single message (all `pending`) so the user can track wizard progress:
   - `[figloops setup] Verify Figma MCP`
   - `[figloops setup] Authenticate with Figma`
   - `[figloops setup] Connect Figma file`
   - `[figloops setup] Configure project settings`
   - `[figloops setup] Initialize figloops`

   Immediately mark `[figloops setup] Verify Figma MCP` as `completed` (MCP preflight already passed).

3. **Figma file readiness check.** Use `AskUserQuestion`:

   ```
   question: "Do you have a Figma file ready for this project?"
   header: "Figma file"
   options:
     - label: "Yes — I have a file ready"
       description: "You'll paste the URL in the next step."
     - label: "No — I need to create one first"
       description: "Open Figma, create a fresh dedicated file, then re-run /figloops:init."
   ```

   - If **"No"**: print `Open Figma, create a new file, then re-run /figloops:init.` and abort.
   - If **"Yes"**: continue.

4. **Determine `<PLUGIN_DIR>`.** It is this skill's parent directory's parent (i.e., `.../figloops`). If `FIGLOOPS_PLUGIN_DIR` is not already set, print the resolved absolute path and tell the user you'll write it into `.env` later.

5. **Figma PAT validation.** Mark `[figloops setup] Authenticate with Figma` as `in_progress`.

   **5a. Upfront check — look for an existing token before asking anything:**
   - Check `process.env.FIGMA_TOKEN` (shell environment).
   - If not in shell env, check if `.env` exists in cwd and contains a `FIGMA_TOKEN=` line; extract the value.
   - If a token is found either way, silently validate it (step 5c below). On success, tell the user: `"Found an existing FIGMA_TOKEN — validated successfully."` Mark `[figloops setup] Authenticate with Figma` as `completed` and skip to step 6.
   - On validation failure, tell the user the token is invalid and continue to step 5b.

   **5b. If no valid token was found, use `AskUserQuestion`:**

   ```
   question: "How would you like to set up your Figma Personal Access Token?"
   header: "Figma PAT"
   options:
     - label: "I already have one — I'll paste it now"
       description: "You have a PAT from a previous project. Paste it and figloops will validate it."
     - label: "I need to create one"
       description: "Use 'Read and write' scope for files and comments. Re-run /figloops:init when done."
     - label: "It's already in my shell / .env"
       description: "figloops will read FIGMA_TOKEN from your environment right now."
   ```

   - **"I already have one"**: prompt them to paste the token as plain text in their next message.
   - **"I need to create one"**: print `https://www.figma.com/developers/api#access-tokens` with scope instructions, then abort. Tell them to re-run `/figloops:init` when they have the token.
   - **"It's already in my shell / .env"**: re-run step 5a. If still not found, tell them the variable name to set and abort.

   **5c. Validate the token** (whichever source provided it):

   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" -e "import('<PLUGIN_DIR>/src/figma-client.js').then(m => m.getMe({ token: process.env.FIGMA_TOKEN }).then(me => console.log(JSON.stringify(me)))).catch(e => { console.error(e.message); process.exit(1); })"
   ```

   Set `FIGMA_TOKEN=<token>` in the env for this invocation; do not write to `.env` yet. On failure (401 / network), abort init with the error message + `https://www.figma.com/developers/api#access-tokens`. On success, mark `[figloops setup] Authenticate with Figma` as `completed`.

6. **Figma file URL validation.** Mark `[figloops setup] Connect Figma file` as `in_progress`. Ask the user to paste their Figma file URL. Accept any of:
   - `https://www.figma.com/file/<KEY>/<NAME>`
   - `https://www.figma.com/design/<KEY>/<NAME>`
   - `https://www.figma.com/proto/<KEY>/<NAME>`

   Extract the file key (segment after `/file/`, `/design/`, or `/proto/`). Validate access:

   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" -e "import('<PLUGIN_DIR>/src/figma-client.js').then(m => m.getFile({ fileKey: '<KEY>', token: process.env.FIGMA_TOKEN }).then(f => console.log(JSON.stringify(f)))).catch(e => { console.error(e.message); process.exit(1); })"
   ```

   On 403/404, surface the error and re-prompt for a corrected URL. On success, mark `[figloops setup] Connect Figma file` as `completed`.

7. **Project config.** Mark `[figloops setup] Configure project settings` as `in_progress`. Collect settings in this order using `AskUserQuestion` for each:

   **7a. Dev server URL** — use `AskUserQuestion`:
   ```
   question: "What URL is your dev server running on?"
   header: "Dev server"
   options:
     - label: "http://localhost:3000"
       description: "Create React App, Next.js default, Rails"
     - label: "http://localhost:5173"
       description: "Vite default"
     - label: "http://localhost:8080"
       description: "Vue CLI, webpack-dev-server"
     - label: "http://localhost:4200"
       description: "Angular CLI"
   ```
   The "Other" option (auto-provided) lets the user type a custom URL.

   **7b. Viewport** — use `AskUserQuestion`:
   ```
   question: "What viewport size should figloops capture at?"
   header: "Viewport"
   options:
     - label: "1440 × 900  (Recommended)"
       description: "Standard widescreen laptop — good default for most web apps."
     - label: "1920 × 1080"
       description: "Full HD / large desktop monitor."
     - label: "1280 × 800"
       description: "Smaller laptop screen."
     - label: "390 × 844"
       description: "iPhone 14 / mobile portrait."
   ```
   The "Other" option lets the user type `width x height` (parse both formats: `1440x900` or `1440 x 900`).

   **7c. Changelog page name** — use `AskUserQuestion`:
   ```
   question: "What should the Figma changelog page be called?"
   header: "Changelog page"
   options:
     - label: "Changelog  (Recommended)"
       description: "figloops will write round summaries to a page named 'Changelog'."
     - label: "Something else"
       description: "Type a custom page name."
   ```
   If **"Something else"**: prompt for the name as plain text.

   **7d. Route discovery** — auto-detect routes from the codebase, then confirm with the user.

   **7d-i. Detect the framework** by reading `package.json` (`dependencies` + `devDependencies`). Use this table to pick a strategy:

   | Framework detected | Route source | File pattern |
   |---|---|---|
   | `next` | `pages/` dir | `pages/**/*.{tsx,ts,jsx,js}` — exclude `_app`, `_document`, `_error`, `404`, `500`, and anything under `pages/api/` |
   | `next` (app router) | `app/` dir | `app/**/page.{tsx,ts,jsx,js}` |
   | `nuxt` | `pages/` dir | `pages/**/*.vue` |
   | `@sveltejs/kit` | `src/routes/` dir | `src/routes/**/+page.svelte` |
   | `react-router*` or `@tanstack/react-router` | grep | see command below |
   | `vue-router` | grep | see command below |
   | none matched | fallback | see below |

   For file-based frameworks (`next`, `nuxt`, `@sveltejs/kit`), use `find`. For router-config frameworks, use these exact grep commands (use `-E` for extended regex; never use `\s` — use `[[:space:]]` instead):

   React Router:
   ```bash
   grep -rEl "(createBrowserRouter|createHashRouter|RouterProvider|BrowserRouter|<Route)" src/ --include="*.tsx" --include="*.ts" --include="*.jsx" --include="*.js" 2>/dev/null | head -20
   ```

   Vue Router:
   ```bash
   grep -rEl "(createRouter|RouterView|routes[[:space:]]*:)" src/ --include="*.ts" --include="*.js" --include="*.vue" 2>/dev/null | head -10
   ```

   Read the matched files and extract `path:` values or `<Route path=` values from the content.

   Run the appropriate `find` or `grep` command. Filter out:
   - Dynamic catch-all segments (`[...slug]`, `[[...]]`)
   - Route groups in parens (`(marketing)/page.tsx` → strip the group, keep the path)
   - Private segments starting with `_`
   - Index files (convert `index` → `/`)

   Convert each file path to a URL path and a human-readable label:
   - File path → URL: strip the source prefix, strip the filename, convert `[param]` → `:param` (and note it's dynamic)
   - Label: title-case the last meaningful path segment, replace `-` and `_` with spaces (e.g., `/dashboard/user-settings` → label `User Settings`)
   - Skip dynamic routes (paths containing `:param`) — list them separately as skipped with a note.

   **7d-ii. If no framework matched** (fallback): make a single `GET /` request to the dev server URL using:
   ```bash
   curl -s "<DEV_SERVER_URL>" | grep -oP 'href="[^"#?]+"' | sort -u
   ```
   Extract `href` values that look like internal paths (start with `/`, no protocol). Use those as candidates. If even that yields nothing, fall back to asking the user for routes in plain text (original approach).

   **7d-iii. Present the discovered list** in a formatted message before asking anything:

   ```
   Found N routes in your <framework> project:

     /               → Home
     /login          → Login
     /dashboard      → Dashboard
     /dashboard/settings → Settings
     ...

   Skipped (dynamic — no fixed URL to capture):
     /products/[id]
   ```

   **7d-iv. Optional: probe the dev server for stale routes.** Routes discovered from source can be dead code (orphaned files, abandoned features, behind a removed flag). If the dev server is running we can flag them. Use `AskUserQuestion`:

   ```
   question: "Is your dev server running at <URL>? Probing it now will flag routes that may be stale."
   header: "Probe dev server"
   options:
     - label: "Yes — probe it"
       description: "figloops will GET each discovered route and flag any that 404 or aren't linked from /."
     - label: "Not running — skip"
       description: "Continue with the source-only list. You can edit it now or re-run /figloops:init later."
   ```

   - **"Yes — probe it"**: build the stdin payload `{ "baseUrl": "<URL>", "routes": [{"label": "...", "path": "..."}, ...] }` from the discovered list, then run:

     ```bash
     echo '<PAYLOAD_JSON>' | "<PLUGIN_DIR>/node_modules/.bin/tsx" <PLUGIN_DIR>/scripts/probe-routes.ts
     ```

     Parse stdout: `{ serverReachable, entryLinks, routes: [{label, path, status, reachable, linkedFromEntry, finalUrl?, error?}] }`.

     - If `serverReachable === false`: print `"Couldn't reach <URL> — skipping probe. Start your dev server and re-run /figloops:init if you want stale-route detection."` and continue with the unannotated list.
     - If `serverReachable === true`: re-render the list with annotations and a legend, **keeping all routes by default** (option A — warnings only, user decides what to drop in 7d-v):

       ```
       Probed <URL> — flagging possibly-stale routes:

         /                ✓ 200    linked
         /login           ✓ 200    linked
         /dashboard       ✓ 200    linked
         /reports         ⚠ 404    likely stale — keep anyway?
         /admin           ✓ 200    not linked from /  (might be intentional)
         /old-checkout    ✗ refused  unreachable — keep anyway?

       Legend:
         ✓ = 2xx/3xx, ⚠ = 404, ✗ = connection failed
         "linked" = found in an <a href> on /
         "not linked from /" = exists but not discoverable from your entry page
       ```

       Notes:
       - SPAs typically return an empty shell on `/`, so `entryLinks` may be empty. If it is, say so once: `"Note: / returned no <a href> links (typical for SPAs) — 'not linked' flags below are noise here."` and don't repeat the "not linked" annotation on every line.
       - For routes that redirect (`finalUrl` present), append `→ <finalUrl>` to the line.
       - Modals/drawers triggered by query/hash (e.g. `?modal=signup`) won't be auto-detected. Mention this once in the printed output: `"figloops captures top-level routes. Modal/drawer-style overlays aren't detected — add them manually below if you want them captured."`

   - **"Not running — skip"**: continue with the unannotated list.

   **7d-v. Decide what to capture.** Use `AskUserQuestion`:
   ```
   question: "What would you like to do with these routes?"
   header: "Route list"
   options:
     - label: "Capture all of them"
       description: "Use the full discovered list as-is (including any flagged as possibly stale)."
     - label: "Remove some"
       description: "Tell me which paths to drop and I'll update the list."
     - label: "Add more"
       description: "I'll add any routes that weren't detected (e.g. modals via ?modal=...)."
     - label: "Start fresh"
       description: "Ignore the discovered list — I'll provide my own."
   ```

   - **"Capture all"**: use the list as-is.
   - **"Remove some"**: ask which paths to drop (plain text, one per line), remove them, show the updated list, ask again with the same 4 options.
   - **"Add more"**: ask for additional `label  /path` pairs (plain text), append them, show updated list, ask again.
   - **"Start fresh"**: ask the user to provide their own list in plain text (`Label  /path`, one per line). Require at least 1 pair.

   Require at least 1 route before continuing.

   **Path normalization (apply before continuing):** For every route in the final list, ensure the path starts with `/`. If a path is missing the leading slash (e.g. `?tab=reports`, `dashboard`), prepend `/` silently — do not re-prompt. The config validator will reject paths without a leading `/`.

   **7e. Discover scenarios beyond routes (modals, themed variants, etc.).**

   Routes capture top-level pages. **Scenarios** capture states that aren't reachable by URL alone — modals/dialogs, drawers, toasts, dark mode, empty/error states. They're optional; users can add them now or later by editing `figloops.config.json`.

   **7e-i. Library detection.** Read `package.json` (`dependencies` + `devDependencies`) and check for known UI libraries:

   | Category | Package names to detect |
   |---|---|
   | Modal/dialog | `react-modal`, `@radix-ui/react-dialog`, `@headlessui/react`, `vaul`, `@mantine/core`, `@mui/material`, `@chakra-ui/react`, `react-bootstrap`, `react-aria-components` |
   | Toast/notification | `sonner`, `react-hot-toast`, `react-toastify`, `@radix-ui/react-toast`, `notistack` |
   | Theme/dark mode | `next-themes`, `theme-ui` |

   Build a short summary line, e.g. `"Detected: @radix-ui/react-dialog (modals), sonner (toasts), next-themes (themes)."` — or `"No common UI-state libraries detected."` if none match.

   **7e-ii. Ask whether to add scenarios.** Use `AskUserQuestion`:

   ```
   question: "Add scenarios beyond top-level routes? (modals, dark mode, empty/error states, etc.)"
   header: "Scenarios"
   options:
     - label: "Yes — add some now"
       description: "Walk me through adding one or more. You'll define a label, a path, and any setup-click selectors."
     - label: "Skip — I'll add them later"
       description: "figloops will only capture routes. You can edit figloops.config.json to add scenarios any time."
   ```

   **7e-iii. If "Yes — add some now":** prompt as plain text:

   ```
   Enter one scenario per line in this format:

     <label> | <path> | <selector1>; <selector2>; ...

   - <label>: a short name for the Figma frame (e.g. "Sign up modal")
   - <path>: the URL path to navigate to first (e.g. "/")
   - <selector...>: optional, semicolon-separated CSS selectors to click in order
     before capture. Omit (and the trailing `|`) for scenarios reachable by URL
     alone (e.g. dark mode applied at /?theme=dark).

   Examples:
     Sign up modal | / | [data-testid=open-signup]
     Dashboard — empty state | /dashboard?empty=1
     Dashboard — dark mode | /dashboard | [data-testid=toggle-theme]

   Enter your scenarios (blank line to finish):
   ```

   Parse each line:
   - Split on `|` (trim each segment).
   - Required: `label`, `path`. Reject lines without both, surface the error, re-prompt.
   - Optional: `setup` — split the third segment on `;` and trim each. Reject empty selectors.
   - `path` must start with `/`.

   Show the parsed list and confirm via `AskUserQuestion`:

   ```
   question: "Add these scenarios?"
   header: "Confirm scenarios"
   options:
     - label: "Add them all"
       description: "Append the scenarios to the config."
     - label: "Start over"
       description: "Discard and re-enter."
     - label: "Skip — add none"
       description: "Skip scenarios; figloops will only capture routes."
   ```

   Apply the choice. The scenarios are written to the `scenarios` array in step 8.

   **7f. Git workflow preference (only if cwd is a git repo).** First check:

   ```bash
   git rev-parse --is-inside-work-tree 2>/dev/null
   ```

   If the command exits non-zero or prints anything other than `true`, the cwd isn't a git repo — skip this step entirely and don't write a `git` block to the config. The implement phase will silently skip git work.

   If it's a git repo, use `AskUserQuestion`:

   ```
   question: "How should figloops handle git branches per round?"
   header: "Git branches"
   options:
     - label: "Ask me each round  (Recommended)"
       description: "At the implement gate, figloops will offer to create figloops/round-N-<date>."
     - label: "Always create one"
       description: "Auto-create figloops/round-N-<date> at the implement gate, no prompt."
     - label: "Never — I'll manage git myself"
       description: "figloops won't touch git. Suitable for solo prototyping or trunk-based dev."
   ```

   Store the choice as `ask`, `always`, or `never` for step 8.

   Mark `[figloops setup] Configure project settings` as `completed` once the route list is finalized.

8. **Write `figloops.config.json`** in the cwd. Include the `scenarios` block only if step 7e collected any (omit it entirely otherwise). Include the `git` block only if step 7f ran (i.e., cwd is a git repo); omit it entirely otherwise.

   ```json
   {
     "$schema": "<absolute path to PLUGIN_DIR>/config.schema.json",
     "devServer": { "url": "<URL>", "waitFor": "networkidle" },
     "viewport": { "width": <W>, "height": <H> },
     "figma": { "fileKey": "<KEY>", "changelogPageName": "<NAME>" },
     "routes": [ { "label": "<LABEL>", "path": "<PATH>" } ],
     "scenarios": [ { "label": "<LABEL>", "path": "<PATH>", "setup": ["<SELECTOR>"] } ],
     "git": { "branchPerRound": "<ask|always|never>" }
   }
   ```

9. **Write `.env`** (do NOT overwrite if it exists — instead print the keys the user should add manually):

   ```
   FIGMA_TOKEN=<token from step 5>
   FIGLOOPS_PLUGIN_DIR=<PLUGIN_DIR>
   ```

10. **Initialize state.** Mark `[figloops setup] Initialize figloops` as `in_progress`. Run:

    ```bash
    "<PLUGIN_DIR>/node_modules/.bin/tsx" -e "import('<PLUGIN_DIR>/src/state.js').then(m => { m.initState('feedback/state.json'); console.log('initialized'); })"
    ```

    Mark `[figloops setup] Initialize figloops` as `completed`.

11. **Create the round tracker via TaskCreate.** Call `TaskCreate` 9 times in a single message to seed the visible round phases (all `pending`):
    - `[figloops] Capture screenshots`
    - `[figloops] Push to Figma`
    - `[figloops] Wait for user comments`
    - `[figloops] Pull comments`
    - `[figloops] Review comments`
    - `[figloops] Cluster themes`
    - `[figloops] Approve plan`
    - `[figloops] Implement changes`
    - `[figloops] Close round`

12. **Print the "ready" summary** to the user:

    > Setup complete. Round 1 is ready to begin. Run `/figloops:next` to capture screenshots of your configured routes.

---

## Phase: `next`

`next` is a state machine over `feedback/state.json`. Steps:

1. Run MCP preflight (above) unless `currentPhase` is `await-comments` and you're only doing the passive check.
2. Read `feedback/state.json` via:

   ```bash
   cat feedback/state.json
   ```

3. Parse `currentPhase`. Dispatch to the section below matching that phase. Each section ends by either (a) advancing `currentPhase` via `scripts/advance-phase.ts`, or (b) stopping at a user gate.

### Phase handler: `capture`

1. Mark task `[figloops] Capture screenshots` as `in_progress` via `TaskUpdate`.
2. Run:

   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" <PLUGIN_DIR>/scripts/capture.ts
   ```

   Capture stdout JSON: `{ round, captures: [{label, path, filename}], failed: [] }`.
3. Regenerate snapshot:

   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" <PLUGIN_DIR>/scripts/render-snapshot.ts
   ```

4. Present the **preview gate** (Gate 1). First print the summary:

   ```
   Captured N routes for Round <round>:
     01-login.png        → Frame "01 - Login"
     02-dashboard.png    → Frame "02 - Dashboard"
     ...
   Expected Figma layout on page "Round <round>":
     3 columns wide, rows added as needed.
   ```

   Then use `AskUserQuestion`:

   ```
   question: "Do these captures look right?"
   header: "Preview"
   options:
     - label: "Approve — push to Figma  (Recommended)"
       description: "Upload the screenshots and lay them out on a new Round <round> page."
     - label: "Re-capture"
       description: "Run the capture again (e.g. if the dev server state was wrong)."
     - label: "Cancel"
       description: "Stop here. State stays in capture; re-run /figloops:next when ready."
   ```

5. On `"Approve — push to Figma"`: mark task complete, advance: `tsx <PLUGIN_DIR>/scripts/advance-phase.ts push`. Then continue at the `push` handler.
6. On `"Re-capture"`: re-run step 2.
7. On `"Cancel"`: stop here. Do not advance state.

### Phase handler: `push`

1. Mark `[figloops] Push to Figma` as `in_progress`.
2. Run:

   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" <PLUGIN_DIR>/scripts/upload-images.ts
   ```

   Parse stdout: `{ round, uploads: [{label, filename, imageHash}], failed: [] }`. If `uploads` is empty, abort and surface the error.
3. Read `figloops.config.json` to get `figma.fileKey` and `viewport.width`.
4. Compute a human-readable timestamp for the page name. Run:

   ```bash
   date '+%-d %B %Y (%-I:%M %p)'
   ```

   Capture stdout (e.g., `20 May 2026 (2:30 PM)`). Construct the page name as `Round <round> — <timestamp>` (em dash separator). Call the Figma MCP to find or create the page with that name in `<fileKey>`. Capture the returned `pageId`. Note: if push is re-run minutes after a first attempt, the new timestamp won't match the existing page, and a duplicate `Round <round> — <new timestamp>` page will be created. The user can delete the orphan manually.
5. For each upload (preserve order):
   - Compute grid position: `col = i % 3`, `row = floor(i / 3)`. Frame x: `col * (viewport.width + 40)`. Frame y: `row * 1000` (provisional — actual image heights unknown until MCP returns).
   - Frame name: `<NN> - <label>` (2-digit one-indexed).
   - Call MCP to **create the frame** on the page. Capture the returned `frameId`. Do NOT set fills in this call.
6. **Apply image fills via MCP code execution** (the MCP's frame-creation tool does not always auto-bind hashes). For each `(frameId, imageHash)`, call MCP to run:

   ```js
   const node = figma.getNodeById('<frameId>');
   node.fills = [{ type: 'IMAGE', imageHash: '<hash>', scaleMode: 'FILL' }];
   ```

   Verify each fill is applied before moving on.

7. Persist the manifest into state:

   ```bash
   echo '<manifest JSON>' | "<PLUGIN_DIR>/node_modules/.bin/tsx" <PLUGIN_DIR>/scripts/set-manifest.ts
   ```

   Where `<manifest JSON>` is `{ "pageId": "<id>", "frames": [{ "label": "...", "frameId": "...", "imageHash": "..." }, ...] }`.

8. Regenerate snapshot.
9. Print the Figma file URL and tell them to share it with the users they want feedback from.
10. Mark task complete. Advance: `tsx <PLUGIN_DIR>/scripts/advance-phase.ts await-comments`. Continue at `await-comments` handler.

### Phase handler: `await-comments`

1. Mark `[figloops] Wait for user comments` as `in_progress`.
2. Run pull script (it's safe to call when there are no comments yet):

   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" <PLUGIN_DIR>/scripts/pull-comments.ts
   ```

   Parse stdout: `{ round, totalComments, forThisRound }`.
3. **If `forThisRound === 0`:** stay in `await-comments`. Print:

   > No comments yet for Round <round>. Re-run `/figloops:next` once users have responded.

   Do not advance. Do not change task tracker state.
4. **If `forThisRound > 0`:** mark task complete. Advance: `tsx <PLUGIN_DIR>/scripts/advance-phase.ts pull`. Continue at `pull` handler.

### Phase handler: `pull`

(Reached when await-comments succeeded.)

1. Mark `[figloops] Pull comments` as `in_progress`.
2. (Comments are already in `state.json` from the await-comments handler's pull invocation. No additional work needed.)
3. Regenerate snapshot.
4. Mark task complete. Advance: `tsx <PLUGIN_DIR>/scripts/advance-phase.ts comment-review`. Continue at `comment-review`.

### Phase handler: `comment-review`

1. Mark `[figloops] Review comments` as `in_progress`.
2. Read `feedback/state.json`. Render the comments grouped by frame:

   ```
   Round <round> — Comments to review (<N> total)

   Frame "01 - Login":
     - Sarah Lee (#12): "The CTA below the form is hard to find."
     - Mike Chen (#17): "Form copy is unclear; add helper text."

   Frame "02 - Dashboard":
     - Sarah Lee (#23): "Nav doesn't show what's active."

   Your Figma file: <URL>
   ```

3. Use `AskUserQuestion`:

   ```
   question: "How do you want to proceed with these comments?"
   header: "Review comments"
   options:
     - label: "Continue to clustering  (Recommended)"
       description: "You've read everything you need. Advance to clustering themes."
     - label: "Pull again"
       description: "Re-fetch from Figma in case more comments arrived since the last pull."
     - label: "Cancel round"
       description: "Abort the round; state reverts to await-comments so you can re-run /figloops:next later."
   ```

4. On `"Continue to clustering"`: mark task complete, advance: `tsx <PLUGIN_DIR>/scripts/advance-phase.ts cluster`. Continue at `cluster` handler.
5. On `"Pull again"`: re-run pull-comments script, regenerate snapshot, re-render the comment list, ask again with the same 3 options.
6. On `"Cancel round"`: advance back to `await-comments`: `tsx <PLUGIN_DIR>/scripts/advance-phase.ts await-comments`. Stop.

### Phase handler: `cluster`

1. Mark `[figloops] Cluster themes` as `in_progress`.
2. Read `feedback/state.json`. Cluster the current round's comments by inferred semantic theme. Do not group by frame or by author. One theme may span multiple frames.
3. Build the `themes` array and a proposed `plan` array. Each plan item gets:
   - `id`: `p1`, `p2`, `p3`, ... in order
   - `themeName`: matches one of the themes
   - `change`: a concrete proposed change
   - `drivesFrom`: array of comment IDs
   - `status`: `proposed`

4. Update state.json with the new themes and plan. Both are written via dedicated CLIs that take stdin:

   ```bash
   echo '<THEMES_JSON>' | "<PLUGIN_DIR>/node_modules/.bin/tsx" <PLUGIN_DIR>/scripts/set-themes.ts
   echo '{"action":"set","items":[ ... ]}' | "<PLUGIN_DIR>/node_modules/.bin/tsx" <PLUGIN_DIR>/scripts/update-plan.ts
   ```

   Where `<THEMES_JSON>` is a JSON array of `{name, commentIds, summary}` objects, and the update-plan payload's `items` is a JSON array of `{id, themeName, change, drivesFrom, status: 'proposed'}` objects.

5. Regenerate snapshot.
6. Mark task complete. Advance: `tsx <PLUGIN_DIR>/scripts/advance-phase.ts plan-approval`. Continue at `plan-approval`.

### Phase handler: `plan-approval`

1. Mark `[figloops] Approve plan` as `in_progress`.
2. Read state. Render the plan as a markdown table per theme — `### Theme: <name>` header, then a `| # | Change | Drives from |` table with one row per plan item in that theme. Use the global item numbering (across all themes) for the `#` column so the item-picking menus map cleanly. Escape any `|` in cell content as `\|` and replace newlines with spaces.

   ```
   Round <round> — Plan approval

   ### Theme: Navigation clarity

   | # | Change | Drives from |
   |---|---|---|
   | 1 | Add breadcrumbs to Dashboard | Sarah Lee (#12), Mike Chen (#17) |
   | 2 | Highlight active nav item | Sarah Lee (#23) |

   ### Theme: Color contrast

   | # | Change | Drives from |
   |---|---|---|
   | 3 | Increase contrast on secondary buttons | Anita Roy (#41), Mike Chen (#44) |
   ```

3. Use `AskUserQuestion`:

   ```
   question: "How do you want to handle this plan?"
   header: "Approve plan"
   options:
     - label: "Approve all"
       description: "Every proposed item → approved. Advance to implementation."
     - label: "Approve some only"
       description: "Pick item numbers to approve; the rest will be rejected."
     - label: "Edit one"
       description: "Rewrite a single item's change text, then re-prompt for approval."
     - label: "Reject all"
       description: "No items approved. Close the round with an empty changelog note."
   ```

4. Apply the choice (use the pagination patterns described under **Item-picking menus** below for any sub-prompt that picks one or many items):

   - `"Approve all"`: build a status-update payload with every item `→ approved`.

   - `"Approve some only"`: use the **paginated multi-select** pattern (see *Item-picking menus* below) over the plan items. Items the user submits are approved; the rest are rejected. The pattern handles the zero-selection and cancel paths by returning the user to this top-level menu.

   - `"Edit one"`: use the **paginated single-select** pattern to pick the item to edit. Then prompt as plain text — `"New change text for item N?"`. Pipe an updated `set` payload back through `update-plan.ts`, regenerate snapshot, re-render the numbered list, ask again with the same 4 top-level options.

   - `"Reject all"`: status-update payload with every item `→ rejected`. Advance directly to `close` (skip implement).

5. Apply the update via `update-plan.ts`. Regenerate snapshot.
6. If any items are approved: mark task complete; advance: `tsx <PLUGIN_DIR>/scripts/advance-phase.ts implement`. Continue at `implement`.
7. If `"Reject all"`: mark task complete; advance: `tsx <PLUGIN_DIR>/scripts/advance-phase.ts close`. Continue at `close`.

### Phase handler: `implement`

1. Mark `[figloops] Implement changes` as `in_progress`.

2. **Git branch handling.** Only runs on the first entry into `implement` for this round (skip if `state.rounds[currentRound].git?.branch` is already set — see step 2e). Resolve the mode:

   - Read `git.branchPerRound` from `figloops.config.json` (default `"ask"` if the `git` block is absent and the cwd is a git repo; treat as `"never"` if not a git repo).
   - Verify cwd is a git repo: `git rev-parse --is-inside-work-tree 2>/dev/null`. If non-zero, skip to step 3.

   **2a. If mode is `"never"`:** skip to step 3.

   **2b. If mode is `"ask"`:** use `AskUserQuestion`:

   ```
   question: "Create a branch for Round <round>'s implementation?"
   header: "Git branch"
   options:
     - label: "Yes — create figloops/round-<round>-<YYYY-MM-DD>  (Recommended)"
       description: "figloops will branch from your current HEAD and switch to it."
     - label: "No — stay on current branch"
       description: "I'll commit directly to whatever I'm on now."
     - label: "Never ask again"
       description: "Skip git for this round AND update figloops.config.json to git.branchPerRound: never."
   ```

   - `"Yes"`: continue to step 2c.
   - `"No"`: skip to step 3.
   - `"Never ask again"`: edit `figloops.config.json` to set `"git": { "branchPerRound": "never" }`, then skip to step 3.

   **2c. If mode is `"always"` or the user chose "Yes":** check for uncommitted changes:

   ```bash
   git status --porcelain
   ```

   If output is non-empty, abort with:

   > Uncommitted changes detected. Commit or stash them before figloops creates a new branch, then re-run /figloops:next.

   Do not advance state. The user re-runs after handling.

   **2d. Compute branch name.** Use `date '+%Y-%m-%d'` for the date. Base name: `figloops/round-<round>-<date>`. If `git rev-parse --verify <name>` succeeds (branch already exists), append `-2`, `-3`, etc. until unique.

   **2e. Create + switch:**

   ```bash
   git checkout -b <branch-name>
   ```

   Capture the previous branch via `git rev-parse --abbrev-ref HEAD` BEFORE the checkout for the record. Tell the user:

   > Switched to new branch `<branch-name>` (from `<previous-branch>`). Implementation work for this round will live here.

   Persist to state so we don't re-prompt on re-entry. Append to `feedback/state.json` under the current round:

   ```json
   "git": { "branch": "<branch-name>", "baseBranch": "<previous-branch>" }
   ```

   (No dedicated CLI for this — read state.json, set the field, write it back. The state schema accepts unknown fields via passthrough; if validation rejects, surface the error rather than silently dropping.)

3. Read state. List approved items with status:

   ```
   Round <round> — Implementing (<shipped> of <approved> shipped)

   [✓] 1. Add breadcrumbs to Dashboard
   [ ] 2. Highlight active nav item
   [ ] 3. Increase contrast on secondary buttons
   ```

4. Use `AskUserQuestion`:

   ```
   question: "What's your next move?"
   header: "Implement"
   options:
     - label: "Mark items as shipped"
       description: "Pick which items you've finished implementing."
     - label: "Close round"
       description: "Close now; any remaining approved items become 'dropped'."
   ```

5. Apply the choice:
   - `"Mark items as shipped"`: pick which items.
     - Compute `notYetShipped`: the approved items whose status is not `shipped`.
     - Use the **paginated multi-select** pattern (see *Item-picking menus*) over `notYetShipped`. The pattern handles the zero-selection and cancel paths by returning to this top-level menu.
     - Build a status-update payload marking the submitted items `→ shipped`. Apply, regenerate snapshot, re-render the list. If all approved items are now `shipped`, auto-advance; otherwise ask again with the same 2 top-level options.
   - `"Close round"`: status-update payload marking all remaining `approved` items as `dropped`. Apply, advance.
6. When advancing: `tsx <PLUGIN_DIR>/scripts/advance-phase.ts close`. Continue at `close`.

### Phase handler: `close`

1. Mark `[figloops] Close round` as `in_progress`.
2. Compute today's date (UTC YYYY-MM-DD).
3. Run:

   ```bash
   "<PLUGIN_DIR>/node_modules/.bin/tsx" <PLUGIN_DIR>/scripts/format-changelog.ts <round> <round + 1> <date>
   ```

   Capture the markdown string from stdout.
4. Read `figloops.config.json` for `figma.fileKey` and `figma.changelogPageName`.
5. Call MCP to find or create a page named `<changelogPageName>` in the file. Capture `pageId`.
6. Call MCP to enumerate existing frames on that page and compute the next y-position (stack vertically; if empty, start at y=0).
7. Call MCP to create a text frame:
   - name: `Round <round> → Round <round + 1>`
   - position: x=0, y=<computed>
   - width: 800
   - content: the formatted markdown
8. Regenerate snapshot one final time.
9. Bump round + reset phase: `tsx <PLUGIN_DIR>/scripts/advance-phase.ts capture`.
10. Re-create the 9 round tracker tasks for the new round (call `TaskCreate` 9 times with the `[figloops]` prefix titles).
11. Print:

    > Round <round> closed. Round <round + 1> begins — run `/figloops:next` to capture screenshots.

---

## Phase: `status`

Read `feedback/state.json`. Render the current round tracker by listing the 9 figloops tasks and their statuses (use `TaskList` to enumerate, filter to those whose subject starts with `[figloops]`). Add a header line:

```
Round <currentRound> · phase: <currentPhase>
```

Do not advance state. Do not call MCP.

---

## Phase: `help`

The `commands/help.md` file handles this directly without invoking the skill. If for some reason this phase is dispatched here, defer to `commands/help.md` and produce identical output.

---

## Item-picking menus

`AskUserQuestion` caps options at 4. Several gates need to pick from a list that may exceed that — these patterns paginate cleanly without falling back to typed input. Both patterns end with a **recap + confirm** so the user always sees the full picture before anything is applied.

### Paginated multi-select

Use when the user picks **zero or more** items from a list of any length (e.g. plan-approval → "Approve some only", implement → "Mark items as shipped").

1. Chunk the list into pages of 4 items, preserving order.
2. For each page in order, call `AskUserQuestion` with:
   - `multiSelect: true`
   - `question`: `"Select items to <verb> — page <i> of <total>"` (omit the page suffix if there's only 1 page).
   - One option per item on this page. Label: `"<N>. <truncated change>"` (truncate to ~60 chars). Description: full change text.
3. Allow **zero selections per page** — the user may want nothing from this page and continue to the next. Do not enforce a per-page minimum.
4. Accumulate selections across all pages.
5. **Recap + confirm** (always — even on single-page flows):

   Print:

   ```
   You picked these items to <verb> (N selected):
     1. <change text>
     3. <change text>

   These items will NOT be <verbed> (M remaining):
     2. <change text>
     4. <change text>
   ```

   Then `AskUserQuestion`:

   ```
   question: "Submit these selections?"
   header: "Confirm"
   options:
     - label: "Submit  (Recommended)"
       description: "Apply the selections above."
     - label: "Start over"
       description: "Clear all selections and re-pick from page 1."
     - label: "Cancel"
       description: "Discard selections and return to the gate's top menu."
   ```

   - `"Submit"`: return the accumulated selections.
   - `"Start over"`: clear selections, restart pagination from page 1.
   - `"Cancel"`: re-ask the gate's top-level question.

6. If the user reaches the recap with zero accumulated selections, skip the recap and print `"No items selected — returning to the top menu."` and re-ask the gate's top-level question.

### Paginated single-select

Use when the user picks **exactly one** item from a list of any length (e.g. plan-approval → "Edit one").

1. Chunk the list into pages of 3 items, reserving the 4th slot for a sentinel.
2. For each page in order, call `AskUserQuestion` (single-select) with:
   - `question`: `"Pick the item to <verb> — page <i> of <total>"` (omit page suffix if 1 page).
   - Options: one per item on this page (label `"<N>. <truncated change>"`, description = full text).
   - On all pages except the last, append a 4th option: `"Show next page →"` (description: `"None of these — show the next set."`).
3. If the user picks an item: continue to step 5.
4. If the user picks `"Show next page →"`: advance to the next page.
5. **Recap + confirm**:

   Print: `"You picked: <N>. <change text>"`

   Then `AskUserQuestion`:

   ```
   question: "Submit this choice?"
   header: "Confirm"
   options:
     - label: "Submit  (Recommended)"
       description: "Continue with the item above."
     - label: "Pick a different item"
       description: "Re-paginate from page 1 and pick again."
     - label: "Cancel"
       description: "Discard and return to the gate's top menu."
   ```

   - `"Submit"`: return the picked item.
   - `"Pick a different item"`: restart pagination from page 1.
   - `"Cancel"`: re-ask the gate's top-level question.

6. The last page has no `"Show next page →"` sentinel — the user must pick an item there. The recap then runs as above.

### Why not just type item numbers?

Typed input means the user has to scroll back to see numbers, remember syntax (`1,3` vs `1 3`), and can typo. Selection menus eliminate all three failure modes at the cost of an extra click per page — worth it for the consistency. The recap step covers the remaining concern that multi-page selections are easy to lose track of.

---

## Error handling principles

- TS script exits non-zero → relay stderr verbatim, do not retry automatically (except where the script itself retries, e.g. uploads).
- MCP call fails → relay the MCP error verbatim. Note any partial state ("images were uploaded but no frames were created — you can clean up by deleting the Round <N> page if it was created"). Do not advance state.
- State file load fails → abort the command with the load error and tell the user how to recover (back up `feedback/state.json` and re-run `/figloops:init`).

## Notes for future you

- `<PLUGIN_DIR>` is the absolute path where the plugin is installed (e.g., `~/.claude/plugins/figloops`).
- All TS scripts assume cwd is the consuming repo.
- Figma MCP exact tool names vary by server. Official Figma MCP exposes `use_figma`; community `southleft/figma-console-mcp` exposes typed tools. Adapt as needed.
- The `[figloops]` task subject prefix exists to group tasks visually in Claude Code's tracker even if the user has unrelated tasks in the same session.
