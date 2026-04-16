# AGENTS.md

## Product Direction

Build `cx`: an interactive terminal UI for navigating local Codex sessions across project directories without opening the Codex desktop app.

MVP scope:
- Read local Codex metadata from `~/.codex/session_index.jsonl`.
- Enrich rows from `~/.codex/sessions/**/*.jsonl` when available.
- Show a keyboard-driven TUI with search, all/current-cwd scope toggle, resume, fork, and quit.
- Delegate actual continuation to official Codex commands: `codex resume <session-id>` and `codex fork <session-id>`.

Do not implement in MVP:
- Editing, deleting, or rewriting Codex history.
- Displaying full conversation content.
- A daemon, cloud sync, or custom database.

## Stack

- Runtime: Node.js `>=20`
- Language: TypeScript ESM
- TUI: Ink + React
- CLI parser: Commander.js
- Process execution: Execa
- Validation: Zod
- Tests: Vitest

## Commands

- Install dependencies: `npm install`
- Run all tests: `npm test`
- Typecheck: `npm run typecheck`
- Build: `npm run build`
- Run locally: `npm run dev`

## Repository Rules

- Keep changes small and test-driven for behavior.
- Preserve the Codex storage format; treat it as external input and validate defensively.
- Keep filesystem/session parsing separate from Ink components.
- Do not read or print full conversation messages unless explicitly requested.
- Do not commit plans or docs. Project instructions like this `AGENTS.md` are allowed.
- Run `npm test`, `npm run typecheck`, and `npm run build` before finalizing meaningful changes.
