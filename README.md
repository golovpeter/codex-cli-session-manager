# cdx-sessions - Codex Session Navigator

<p align="center">
  <strong>A fast terminal navigator for local Codex sessions across projects.</strong>
</p>

---

## Screenshots

![Directory picker](https://github.com/user-attachments/assets/3325718b-a72c-47a7-a381-92aeda37898a)
*Directory picker*

![Session picker](https://github.com/user-attachments/assets/4dc9171d-0837-447c-a893-08fd5751b2f6)
*Session picker*

Suggested captures:

- `cdx-sessions` start screen with project directories
- selected directory with available sessions
- search mode
- narrow terminal layout

---

`cdx-sessions` is a keyboard-first terminal UI for browsing local Codex sessions without opening the Codex desktop app.

It scans the local Codex session storage, groups sessions by working directory, and lets you jump back into the right thread with the official Codex CLI:

```bash
codex resume <session-id>
codex fork <session-id>
```

`cdx-sessions` does not rewrite Codex history, does not edit session files, and does not display full conversation contents.

### What It Does

- Shows all available local Codex sessions grouped by project directory.
- Includes sessions present only as rollout files, even if they are missing from `session_index.jsonl`.
- Includes archived rollout sessions from `archived_sessions`.
- Hides delegated subagent sessions by default; use `--include-subagents` when you need to inspect them.
- Opens a directory first, then shows sessions inside that directory.
- Supports keyboard navigation, search, resume, fork, and back.
- Uses responsive terminal dimensions, so the visible list adapts to the current window size.

### Keyboard

| Key | Directory screen | Session screen |
| --- | --- | --- |
| `Enter` | Open directory | Resume session |
| `!` | - | Resume without approvals or sandbox |
| `f` | - | Fork session |
| `d` | - | Delete session with confirmation |
| `/` | Search directories | Search sessions |
| `j` / `Down` | Move down | Move down |
| `k` / `Up` | Move up | Move up |
| `Esc` / `Backspace` / `b` | - | Back to directories |
| `q` | Quit | Quit |

Deleting a session removes its row from `session_index.jsonl` and removes the selected rollout file when one is available. `cdx-sessions` asks for confirmation; press `Enter` to confirm or `Esc` to cancel.

Unsafe resume launches `codex --dangerously-bypass-approvals-and-sandbox resume <session-id>`. `cdx-sessions` asks for confirmation before using this mode.

### Install Locally

From npm:

```bash
npm install -g cdx-sessions
cdx-sessions
```

From a local checkout:

```bash
npm install
npm run build
npm link
cdx-sessions
```

After `npm link`, future source changes usually only need:

```bash
npm run build
cdx-sessions
```

### Run Without Linking

```bash
npm run build
node dist/cli.js
```

### Development

```bash
npm run dev
npm test
npm run typecheck
npm run build
```

### How It Finds Sessions

`cdx-sessions` reads local Codex metadata from:

```text
~/.codex/session_index.jsonl
~/.codex/sessions/**/*.jsonl
~/.codex/archived_sessions/*.jsonl
```

The session reader uses `session_meta` records for metadata such as session id, working directory, timestamp, Codex CLI version, and model provider. It avoids printing conversation messages.

### Stack

- TypeScript
- Node.js `>=20`
- Ink + React
- Commander.js
- Execa
- Zod
- Vitest
