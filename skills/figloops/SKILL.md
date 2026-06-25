---
name: figloops
description: Phase dispatch hub
user-invocable: false
---

This skill is a fallback dispatch hub. Command files invoke phase-specific skills directly. If this skill is invoked with a phase argument, route to the matching skill:

| Phase / Command | Skill |
|---|---|
| `init` | `figloops-init` |
| `capture` | `figloops-go-capture` |
| `push` | `figloops-go-push` |
| `await-comments` | `figloops-go-await` |
| `pull` | `figloops-go-pull` |
| `comment-review` | `figloops-go-review` |
| `cluster` | `figloops-go-cluster` |
| `plan-ack` | `figloops-go-plan-ack` |
| `close` | `figloops-go-close` |
| `status` | Read `feedback/state.json`, print `Round <N> · phase: <phase>`, list `[FIGLOOPS]` tasks via TaskList. |
| `restart` | `figloops-restart` |
| `summary` | `figloops-summary` |
| `uninstall` | `figloops-uninstall` |
| `whatsnew` | `figloops-whatsnew` |

For `next` without a known phase: read `feedback/state.json` first, then invoke the matching skill from the table above.
