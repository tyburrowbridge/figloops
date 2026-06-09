---
name: figloops-whatsnew
description: Show latest figloops release notes and check for available upgrade
user-invocable: false
---

Render figloops release notes in a scannable stripe format with category icons, plus a remote version check. Do not invoke any other skill.

## Step 1 — read installed version

Read `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`. Parse the `version` field. Call this `installed`.

If the read fails, print:
```
figloops · whatsnew
Could not read installed plugin version (plugin.json missing).
```
and stop.

## Step 2 — read CHANGELOG

Read `${CLAUDE_PLUGIN_ROOT}/CHANGELOG.md`. Parse all sections whose header matches the regex `^## v(\d+\.\d+\.\d+\S*) — (\d{4}-\d{2}-\d{2})$`. Build a list of `{version, isoDate, body}` entries in file order (newest first).

If no entries parse, print:
```
figloops · whatsnew
No CHANGELOG entries found.
```
and stop.

For each entry, parse `body` into `{categoryHeader, items[]}` groups where:
- A `categoryHeader` is a line matching `^### (.+)$` (e.g. `### Features`, `### Performance`, `### Polish`, `### Breaking`, `### Fixes`, `### Security`).
- An `item` is a bullet line matching `^- (.+)$` immediately following (or under) a category header.
- If a version's body contains items with no preceding `###` header, treat them as category `Misc`.

## Step 3 — check remote version

Use `WebFetch` against:
```
https://raw.githubusercontent.com/tyburrowbridge/figloops/main/.claude-plugin/plugin.json
```
with prompt: `Return only the value of the "version" field as plain text.`

Treat the response as `remote`. If the fetch fails, times out, or the returned value does not match `\d+\.\d+\.\d+\S*`, set `remoteAvailable = false` and continue. **Do not fail the whole command.**

## Step 4 — build the header line

Compute the header based on the version comparison (semver rules in Step 6):

- If `remoteAvailable = false`: `figloops v<installed> · ? remote check failed`
- If `installed == remote`: `figloops v<installed> · ✓ up to date`
- If `installed < remote`: `figloops v<installed> · ⬆ v<remote> available · run /plugin update figloops`
- If `installed > remote`: `figloops v<installed> · ⬆ local build ahead of main (v<remote>)`

## Step 5 — render the stripe layout

Print exactly this structure (preserve spacing — two-space indent before icon, two spaces between icon and text):

```
<header line>

```

Then, for each of the **3 most recent** CHANGELOG entries (newest first):

```
━━━ v<version> · <MMM DD YYYY> ━━━

  <icon>  <item text>
  <icon>  <item text>


```

(Trailing blank line between version blocks — two newlines.)

### Date format

Convert `isoDate` (`YYYY-MM-DD`) to `MMM DD YYYY` using English month abbreviations (`Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec`) and zero-padded day. Example: `2026-06-09` → `Jun 09 2026`.

### Category → icon mapping

| `### Header` (case-insensitive)        | Icon |
|----------------------------------------|------|
| `Features`                             | ✨   |
| `Performance`                          | ⚡   |
| `Fixes` / `Bug Fixes` / `Bugfixes`     | 🔧   |
| `Polish`                               | 🎨   |
| `Breaking`                             | ⚠️    |
| `Security`                             | 🔒   |
| `Notes` / `Misc` / anything else       | 📝   |

### Item rendering

- Print one `  <icon>  <item>` line per bullet.
- Preserve inline markdown (`backticks`, `**bold**`, `*italic*`) in the item text — Claude Code's renderer will style them.
- For long items, wrap at ~80 chars with a 6-space hanging indent so wrapped text aligns under the item start (after the icon and gap).

### Empty version

If a parsed version has zero items after parsing (rare — e.g. only contained sub-headers without bullets), print:
```
  📝  (no detail recorded)
```

## Step 6 — semver compare

- Strip any pre-release suffix (`-beta`, `-rc.1`, etc.) for ordering.
- Split each on `.`, parse each segment as integer, compare element-wise.
- Pre-release tags rank older than the equivalent release: `1.3.0-beta < 1.3.0 < 1.3.1`.

## Example output

```
figloops v1.4.3 · ✓ up to date


━━━ v1.4.3 · Jun 09 2026 ━━━

  🎨  Updated plugin description to match README tagline


━━━ v1.4.2 · Jun 09 2026 ━━━

  🎨  Hide internal skills from `/` picker — only colon commands now visible


━━━ v1.4.0 · Jun 09 2026 ━━━

  ✨  `/figloops:whatsnew` — pull-only release notes + upgrade check
  ✨  `/figloops:help` now shows installed version
```

Print no commentary outside the rendered block.
