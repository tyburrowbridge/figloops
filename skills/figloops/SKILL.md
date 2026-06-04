---
name: figloops
description: Wizard-driven figloops workflow — dispatch hub. Prefer invoking phase-specific skills directly via the command files.
---

This skill is a fallback dispatch hub. Command files invoke phase-specific skills directly. If this skill is invoked with a phase argument, route to the matching skill:

| Phase / Command | Skill |
|---|---|
| `init` | `figloops-init` |
| `capture` | `figloops-next-capture` |
| `push` | `figloops-next-push` |
| `await-comments` | `figloops-next-await` |
| `pull` | `figloops-next-pull` |
| `comment-review` | `figloops-next-review` |
| `cluster` | `figloops-next-cluster` |
| `plan-approval` | `figloops-next-plan` |
| `implement` | `figloops-next-implement` |
| `close` | `figloops-next-close` |
| `status` | Read `feedback/state.json`, print `Round <N> · phase: <phase>`, list `[FIGLOOPS]` tasks via TaskList. |

For `next` without a known phase: read `feedback/state.json` first, then invoke the matching skill from the table above.
