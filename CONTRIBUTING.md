# Contributing

## Setup

```bash
npm install
npm test        # 58 unit + integration tests
npm run build   # TypeScript type-check (no emit)
```

## Before opening a PR

1. Run `npm test` — all tests must pass.
2. Run `npm run build` — no type errors.
3. If you changed any skill or command file, manually smoke-test the affected phase against a throwaway Figma file (MCP integration can't be tested in CI).

## Smoke test procedure

Run the full round end-to-end against a throwaway Figma file:

```
/figloops:init  →  capture  →  push  →  (add comments in Figma)
→  pull  →  review  →  cluster  →  approve  →  implement  →  close
```

Assert at each step:
- `feedback/state.json` `currentPhase` advances correctly
- Figma side-effects match (frames created, changelog page written)
- No leftover `[FIGLOOPS]` tasks in an unexpected state

## Project structure

| Path | Purpose |
|---|---|
| `skills/` | Claude Code skill files (one per phase) |
| `commands/` | Slash command entry points |
| `scripts/` | TypeScript helpers invoked by skills |
| `src/` | Shared library (`config.ts`, `state.ts`, `figma-client.ts`) |
| `tests/` | Vitest unit + integration tests |
| `docs/` | Design specs and architecture notes |
