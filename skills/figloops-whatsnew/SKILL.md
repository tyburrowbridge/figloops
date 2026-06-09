---
name: figloops-whatsnew
description: Show latest figloops release notes and check for available upgrade
---

Render figloops release notes and a remote version check. Do not invoke any other skill.

## Step 1 — read installed version

Read `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`. Parse the `version` field. Call this `installed`.

If the read fails, print:
```
figloops · whatsnew
Could not read installed plugin version (plugin.json missing).
```
and stop.

## Step 2 — read CHANGELOG

Read `${CLAUDE_PLUGIN_ROOT}/CHANGELOG.md`. Parse all sections whose header matches the regex `^## v(\d+\.\d+\.\d+\S*) — (.+)$`. Build a list of `{version, date, body}` entries in file order (newest first, since the file is written newest-on-top).

If no entries parse, print:
```
figloops · whatsnew
No CHANGELOG entries found.
```
and stop.

## Step 3 — check remote version

Use `WebFetch` against:
```
https://raw.githubusercontent.com/tyburrowbridge/figloops/main/.claude-plugin/plugin.json
```
with prompt: `Return only the value of the "version" field as plain text.`

Treat the response as `remote`. If the fetch fails, times out, or the returned value does not match `\d+\.\d+\.\d+\S*`, treat `remote` as unknown — set a `remoteAvailable = false` flag and continue. **Do not fail the whole command.**

## Step 4 — render

Print this exact structure:

```
figloops · whatsnew

  Installed: v<installed>
  Latest:    v<remote>   <upgrade-hint>

— Release notes —

## v<latest-changelog-version> — <date>
<body>

## v<prev-changelog-version> — <date>
<body>

(…up to 3 most recent entries…)
```

**`<upgrade-hint>` rules:**
- If `remoteAvailable = false`: render `(could not check)` instead of `v<remote>`, omit `<upgrade-hint>`.
- If `installed == remote`: append `· up to date`.
- If `installed < remote` (semver compare, see below): append `· run /plugin update figloops to upgrade`.
- If `installed > remote` (local ahead): append `· (local build ahead of main)`.

**Semver compare:**
- Strip pre-release suffix (`-beta`, `-rc.1`, etc.) for comparison purposes.
- Split each version on `.`, parse each segment as integer, compare lexicographically.
- Pre-release tags are considered older than the equivalent release (`1.3.0-beta < 1.3.0 < 1.3.1`).

**Release notes body:**
- Show the 3 most recent CHANGELOG entries verbatim (already markdown — preserve sub-headers like `### Features`, `### Performance`, etc.).
- Separate entries with one blank line.

Print no commentary outside the rendered block.
