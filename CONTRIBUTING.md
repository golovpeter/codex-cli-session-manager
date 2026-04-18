# Contributing

Thanks for taking the time to improve `cdx-sessions`.

This project is intentionally small: it should stay focused on making local Codex sessions easy to find, preview, and resume from the terminal.

## Development Setup

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

## Pull Request Checklist

Before opening a pull request, run:

```bash
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

Include tests when the change affects parsing, filtering, navigation, delete behavior, resume/fork commands, or UI state transitions.

## Code Guidelines

- Keep session parsing separate from Ink UI components.
- Treat Codex session files as external input and validate defensively.
- Do not print full conversation transcripts by default.
- Keep previews raw and bounded; do not add generated summaries without an explicit opt-in design.
- Preserve the official Codex CLI as the execution layer for resume and fork.
- Avoid broad refactors unless they directly support the change.

## Documentation

Documentation should be English-only and should not include local machine paths, personal screenshots, private session ids, or private conversation content.

Screenshots in `assets/screenshots/` are representative terminal captures. Keep them generic and safe for public npm and GitHub display.

## Release Process

1. Update `package.json` and `package-lock.json` with the new version.
2. Run the full local checklist.
3. Commit the release changes.
4. Create a GitHub release.
5. Publish to npm:

```bash
npm publish
```

Use `npm pack --dry-run` before publishing when package contents change.
